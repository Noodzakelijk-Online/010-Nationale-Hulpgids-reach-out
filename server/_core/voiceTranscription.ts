/**
 * Voice transcription helper using internal Speech-to-Text service
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Upload audio to storage (e.g., S3) to get URL
 * 3. Call transcription with the URL
 * 
 * Example usage:
 * ```tsx
 * // Frontend component
 * const transcribeMutation = trpc.voice.transcribe.useMutation({
 *   onSuccess: (data) => {
 *     console.log(data.text); // Full transcription
 *     console.log(data.language); // Detected language
 *     console.log(data.segments); // Timestamped segments
 *   }
 * });
 * 
 * // After uploading audio to storage
 * transcribeMutation.mutate({
 *   audioUrl: uploadedAudioUrl,
 *   language: 'en', // optional
 *   prompt: 'Transcribe the meeting' // optional
 * });
 * ```
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
];

const MAX_TRANSCRIPTION_BYTES = 16 * 1024 * 1024; // 16 MB hard cap for request payload
const FETCH_TIMEOUT_MS = 15_000;

function getAllowedAudioHosts() {
  return (process.env.TRANSCRIPTION_AUDIO_HOST_ALLOWLIST || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function validateAudioUrl(audioUrl: string): string | TranscriptionError {
  let parsed: URL;
  try {
    parsed = new URL(audioUrl);
  } catch {
    return {
      error: "Audio URL is invalid",
      code: "INVALID_FORMAT",
      details: "The audio URL must be a valid HTTPS URL",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      error: "Audio URL must use HTTPS",
      code: "INVALID_FORMAT",
      details: "Only HTTPS audio URLs are accepted for transcription",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return {
      error: "Audio URL host is not allowed",
      code: "INVALID_FORMAT",
      details: "Local and private-network hosts cannot be fetched by the transcription service",
    };
  }

  const allowedHosts = getAllowedAudioHosts();
  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    return {
      error: "Audio URL host is not allowlisted",
      code: "INVALID_FORMAT",
      details: "Set TRANSCRIPTION_AUDIO_HOST_ALLOWLIST to permit this host",
    };
  }

  return parsed.toString();
}

async function downloadAudio(url: string): Promise<{
  data: Buffer;
  mimeType: string;
}> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const mimeType = response.headers.get("content-type") || "audio/mpeg";
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_TRANSCRIPTION_BYTES) {
      throw new Error(
        `File size is ${(declaredLength / 1024 / 1024).toFixed(2)}MB, maximum allowed is 16MB`
      );
    }
  }

  const body = response.body;
  if (!body) {
    throw new Error("Audio response has no body");
  }

  let received = 0;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > MAX_TRANSCRIPTION_BYTES) {
        throw new Error(
          `File size exceeds maximum allowed size of ${(MAX_TRANSCRIPTION_BYTES / 1024 / 1024).toFixed(0)}MB`
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (!reader.closed && reader.cancel) {
      await reader.cancel(error instanceof Error ? error.message : "download failed");
    }
    throw error;
  }

  const audioBuffer = Buffer.concat(
    chunks.map(chunk => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    received
  );

  return { data: audioBuffer, mimeType };
}

/**
 * Transcribe audio to text using the internal Speech-to-Text service
 * 
 * @param options - Audio data and metadata
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  if (!ENV.forgeApiUrl) {
    return {
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_URL is not set",
    };
  }
  if (!ENV.forgeApiKey) {
    return {
      error: "Voice transcription service authentication is missing",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_KEY is not set",
    };
  }

  // Step 2: Download audio from URL
  const validatedAudioUrl = validateAudioUrl(options.audioUrl);
  if (typeof validatedAudioUrl !== "string") {
    return validatedAudioUrl;
  }

  let audioBuffer: Buffer;
  let mimeType: string;
  try {
    const audioDownload = await downloadAudio(validatedAudioUrl);
    audioBuffer = audioDownload.data;
    mimeType = audioDownload.mimeType;
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const isLargeError =
      details.includes("maximum allowed size") ||
      details.includes("File size is");
    return {
      error: isLargeError
        ? "Audio file exceeds maximum size limit"
        : "Failed to fetch audio file",
      code: isLargeError ? "FILE_TOO_LARGE" : "SERVICE_ERROR",
      details,
    };
  }

  if (!audioBuffer.length) {
    return {
      error: "Failed to download audio file",
      code: "SERVICE_ERROR",
      details: "Audio download returned no bytes",
    };
  }

  // Step 3: Build service request
  const filename = `audio.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], {
    type: mimeType,
  });
  const formData = new FormData();
  formData.append("file", audioBlob, filename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const prompt = options.prompt || (
    options.language
      ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
      : "Transcribe the user's voice to text"
  );
  formData.append("prompt", prompt);

  const baseUrl = ENV.forgeApiUrl.endsWith("/")
    ? ENV.forgeApiUrl
    : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    // Step 5: Parse and return the transcription result
    const whisperResponse = await response.json() as WhisperResponse;
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format",
      };
    }

    return whisperResponse;
  } catch (error) {
    const details = error instanceof Error ? error.message : "An unexpected error occurred";
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details,
    };
  }
}

/**
 * Helper function to get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
  };
  
  return mimeToExt[mimeType] || 'audio';
}

/**
 * Helper function to get full language name from ISO code
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
  };
  
  return langMap[langCode] || langCode;
}

/**
 * Example tRPC procedure implementation:
 * 
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 * 
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioUrl: z.string(),
 *       language: z.string().optional(),
 *       prompt: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio(input);
 *       
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *       
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         audioUrl: input.audioUrl,
 *         createdAt: new Date(),
 *       });
 *       
 *       return result;
 *     }),
 * });
 * ```
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MAX_TRANSCRIPTION_BYTES = 16 * 1024 * 1024;

const previousEnv = {
  BUILT_IN_FORGE_API_URL: process.env.BUILT_IN_FORGE_API_URL,
  BUILT_IN_FORGE_API_KEY: process.env.BUILT_IN_FORGE_API_KEY,
};

function createResponse(
  body: BodyInit | null,
  init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}
) {
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: init.headers ?? {},
  });
}

function createLargeStream(totalBytes: number, chunkSize = 1024 * 256) {
  let remaining = totalBytes;
  return new ReadableStream({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }

      const size = Math.min(chunkSize, remaining);
      controller.enqueue(new Uint8Array(size));
      remaining -= size;
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  process.env.BUILT_IN_FORGE_API_URL = "https://api.example.com";
  process.env.BUILT_IN_FORGE_API_KEY = "test-key";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    createResponse("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

type VoiceTranscribeInput = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

async function transcribeAudio(input: VoiceTranscribeInput) {
  const module = await import("./voiceTranscription");
  return module.transcribeAudio(input);
}

afterEach(() => {
  vi.restoreAllMocks();
  if (previousEnv.BUILT_IN_FORGE_API_URL === undefined) {
    delete process.env.BUILT_IN_FORGE_API_URL;
  } else {
    process.env.BUILT_IN_FORGE_API_URL = previousEnv.BUILT_IN_FORGE_API_URL;
  }
  if (previousEnv.BUILT_IN_FORGE_API_KEY === undefined) {
    delete process.env.BUILT_IN_FORGE_API_KEY;
  } else {
    process.env.BUILT_IN_FORGE_API_KEY = previousEnv.BUILT_IN_FORGE_API_KEY;
  }
});

describe("voice transcription resource controls", () => {
  it("rejects content-length larger than the hard download cap", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      createResponse(
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(MAX_TRANSCRIPTION_BYTES + 1),
          },
        }
      )
    );

    const result = await transcribeAudio({ audioUrl: "https://cdn.example.com/audio.mp3" });
    expect(result).toMatchObject({
      code: "FILE_TOO_LARGE",
      error: "Audio file exceeds maximum size limit",
    });
  });

  it("aborts when streamed bytes exceed the hard download cap", async () => {
    vi
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(createLargeStream(MAX_TRANSCRIPTION_BYTES + 1024), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      );

    const result = await transcribeAudio({ audioUrl: "https://cdn.example.com/audio.m4a" });
    expect(result).toMatchObject({
      code: "FILE_TOO_LARGE",
      error: "Audio file exceeds maximum size limit",
    });
  });
});

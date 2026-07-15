const DEFAULT_MAX_JSON_CHARS = 12000;
const DEFAULT_MAX_STRING_CHARS = 1000;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ARRAY_ITEMS = 50;
const DEFAULT_MAX_OBJECT_KEYS = 50;

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(password|passphrase|secret|token|cookie|session|api[-_]?key|authorization|credential|csrf|private[-_]?key)([_-]|$)|encryptedPassword|sessionData|messageContent|responseContent|rawContent|normalizedContent|approvedContentSnapshot|content$/i;
const SENSITIVE_TEXT_ASSIGNMENT_PATTERN =
  /\b(password|passphrase|api[-_\s]?key|token|secret|cookie|session|authorization|credential|csrf|private[-_\s]?key)\s*[:=]\s*([^\s,;}"'&]+)/gi;
const SENSITIVE_TEXT_QUERY_PATTERN =
  /([?&](?:password|passphrase|api[-_\s]?key|token|secret|cookie|session|authorization|credential|csrf|private[-_\s]?key)=)([^&\s]+)/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[a-z0-9._~+/-]+=*/gi;

export function redactSecretLikeText(value: string) {
  return value
    .replace(SENSITIVE_TEXT_ASSIGNMENT_PATTERN, "$1=[redacted]")
    .replace(SENSITIVE_TEXT_QUERY_PATTERN, "$1[redacted]")
    .replace(BEARER_TOKEN_PATTERN, "bearer [redacted]");
}

export function serializeSafeJson(
  value: unknown,
  options: {
    maxJsonChars?: number;
    maxStringChars?: number;
    maxDepth?: number;
    maxArrayItems?: number;
    maxObjectKeys?: number;
  } = {}
) {
  const maxJsonChars = options.maxJsonChars ?? DEFAULT_MAX_JSON_CHARS;
  const sanitized = sanitizeForJson(value, {
    maxStringChars: options.maxStringChars ?? DEFAULT_MAX_STRING_CHARS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS,
  });
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= maxJsonChars) return serialized;

  return JSON.stringify({
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, maxJsonChars),
  });
}

export function truncateOperationalText(value: unknown, maxChars = 2000) {
  if (value == null) return undefined;
  const text = String(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...[truncated]`;
}

function sanitizeForJson(
  value: unknown,
  options: {
    maxStringChars: number;
    maxDepth: number;
    maxArrayItems: number;
    maxObjectKeys: number;
  },
  depth = 0
): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    const redacted = redactSecretLikeText(value);
    if (redacted.length <= options.maxStringChars) return redacted;
    return `${redacted.slice(0, options.maxStringChars)}...[truncated]`;
  }

  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }

  if (value instanceof Date) return value.toISOString();

  if (depth >= options.maxDepth) {
    return "[max depth exceeded]";
  }

  if (Array.isArray(value)) {
    const entries = value
      .slice(0, options.maxArrayItems)
      .map(entry => sanitizeForJson(entry, options, depth + 1));
    if (value.length > options.maxArrayItems) {
      entries.push(`[${value.length - options.maxArrayItems} items truncated]`);
    }
    return entries;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, entryValue] of entries.slice(0, options.maxObjectKeys)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
      } else {
        const sanitizedValue = sanitizeForJson(entryValue, options, depth + 1);
        if (sanitizedValue !== undefined) result[key] = sanitizedValue;
      }
    }
    if (entries.length > options.maxObjectKeys) {
      result.__truncatedKeys = entries.length - options.maxObjectKeys;
    }
    return result;
  }

  return String(value);
}

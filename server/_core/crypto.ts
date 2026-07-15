import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENV } from "./env";
import {
  assertHostedProductionSecret,
  isLocalDesktopMode,
} from "./secretPolicy";

const VERSION_PREFIX = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const LOCAL_KEY_FILE = "credential-encryption.key";

function getLocalCredentialKeyPath() {
  const localDataDir =
    process.env.LOCAL_DATA_DIR ||
    path.join(process.env.APPDATA || os.tmpdir(), "NationaleHulpgidsReachOut");
  return path.join(localDataDir, LOCAL_KEY_FILE);
}

function getOrCreateLocalCredentialKey() {
  const keyPath = getLocalCredentialKeyPath();
  if (fs.existsSync(keyPath)) {
    const existingKey = fs.readFileSync(keyPath, "utf-8").trim();
    if (existingKey) return existingKey;
  }

  const key = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key, { encoding: "utf-8", mode: 0o600 });
  return key;
}

function getEncryptionKey() {
  const configuredSecret =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    ENV.cookieSecret;
  const secret =
    configuredSecret ||
    (isLocalDesktopMode()
      ? getOrCreateLocalCredentialKey()
      : "local-development-credential-key");

  if (
    !configuredSecret &&
    !isLocalDesktopMode() &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET must be configured before storing credentials."
    );
  }
  assertHostedProductionSecret(
    process.env.CREDENTIAL_ENCRYPTION_KEY
      ? "CREDENTIAL_ENCRYPTION_KEY"
      : "JWT_SECRET",
    configuredSecret,
    "credential encryption"
  );

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string | undefined | null) {
  if (!value) return undefined;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string | undefined | null) {
  if (!value) return undefined;

  if (!value.startsWith(`${VERSION_PREFIX}:`)) {
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      return undefined;
    }
  }

  const [, ivValue, authTagValue, encryptedValue] = value.split(":");
  if (!ivValue || !authTagValue || !encryptedValue) return undefined;

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

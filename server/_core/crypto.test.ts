import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const previousEnv = {
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  LOCAL_DATA_DIR: process.env.LOCAL_DATA_DIR,
  LOCAL_DESKTOP_MODE: process.env.LOCAL_DESKTOP_MODE,
  NODE_ENV: process.env.NODE_ENV,
};

let tempDir: string | null = null;

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("credential crypto", () => {
  it("creates and reuses a local desktop credential key in production mode", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reachout-crypto-"));
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    process.env.LOCAL_DESKTOP_MODE = "1";
    process.env.LOCAL_DATA_DIR = tempDir;

    const encrypted = encryptSecret("local desktop secret");
    const keyPath = path.join(tempDir, "credential-encryption.key");
    const firstKey = fs.readFileSync(keyPath, "utf-8");

    expect(encrypted).toMatch(/^v1:/);
    expect(decryptSecret(encrypted)).toBe("local desktop secret");

    encryptSecret("another secret");

    expect(fs.readFileSync(keyPath, "utf-8")).toBe(firstKey);
  });

  it("requires an explicit credential key for non-local production storage", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.LOCAL_DESKTOP_MODE;
    process.env.NODE_ENV = "production";

    expect(() => encryptSecret("hosted production secret")).toThrow(
      /CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET/
    );
  });

  it("rejects short hosted production credential encryption secrets", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "short-secret";
    delete process.env.JWT_SECRET;
    delete process.env.LOCAL_DESKTOP_MODE;
    process.env.NODE_ENV = "production";

    expect(() => encryptSecret("hosted production secret")).toThrow(
      /CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters/
    );
  });
});

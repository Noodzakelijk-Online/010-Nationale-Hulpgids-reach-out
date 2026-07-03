import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOAuthState,
  getOAuthStartupLogEntry,
  parseOAuthRedirectUriFromState,
} from "./sdk";

const previousEnv = {
  JWT_SECRET: process.env.JWT_SECRET,
  LOCAL_DESKTOP_MODE: process.env.LOCAL_DESKTOP_MODE,
  NODE_ENV: process.env.NODE_ENV,
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL,
  VITE_APP_ID: process.env.VITE_APP_ID,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function importFreshSdk() {
  vi.resetModules();
  return import("./sdk");
}

describe("SDK session security", () => {
  beforeEach(() => {
    restoreEnv();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("refuses to sign hosted production sessions without JWT_SECRET", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_APP_ID = "reachout-test-app";
    delete process.env.JWT_SECRET;

    const { sdk } = await importFreshSdk();

    await expect(
      sdk.createSessionToken("production-user", { name: "Production User" })
    ).rejects.toThrow(/JWT_SECRET must be configured/);
  });

  it("refuses short hosted production JWT secrets", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_APP_ID = "reachout-test-app";
    process.env.JWT_SECRET = "short-secret";

    const { sdk } = await importFreshSdk();

    await expect(
      sdk.createSessionToken("production-user", { name: "Production User" })
    ).rejects.toThrow(/JWT_SECRET must be at least 32 characters/);
  });

  it("signs and verifies production sessions only with an explicit JWT secret", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_APP_ID = "reachout-test-app";
    process.env.JWT_SECRET =
      "test-only-session-secret-with-enough-entropy-for-regression";

    const { sdk } = await importFreshSdk();

    const token = await sdk.createSessionToken("production-user", {
      name: "Production User",
    });
    const session = await sdk.verifySession(token);

    expect(session).toEqual({
      openId: "production-user",
      appId: "reachout-test-app",
      name: "Production User",
    });
  });
});

describe("OAuth startup logging", () => {
  it("uses a neutral startup message when external OAuth is disabled for desktop mode", () => {
    expect(getOAuthStartupLogEntry("", true)).toEqual({
      level: "info",
      args: [
        "[OAuth] External OAuth disabled in local desktop mode; using local desktop session.",
      ],
    });
  });

  it("keeps the missing OAuth server error for hosted mode", () => {
    expect(getOAuthStartupLogEntry("", false)).toEqual({
      level: "error",
      args: [
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.",
      ],
    });
  });

  it("logs the configured OAuth server URL when external OAuth is available", () => {
    expect(
      getOAuthStartupLogEntry("https://oauth.example.test", true)
    ).toEqual({
      level: "info",
      args: [
        "[OAuth] Initialized with baseURL:",
        "https://oauth.example.test",
      ],
    });
  });
});

describe("OAuth state validation", () => {
  const stateSecret = "test-only-oauth-state-secret-with-enough-entropy";

  it("creates and verifies signed OAuth callback state", () => {
    const state = createOAuthState("https://example.com/api/oauth/callback", {
      now: 1_000,
      secret: stateSecret,
    });

    expect(
      parseOAuthRedirectUriFromState(state, {
        now: 1_000,
        secret: stateSecret,
        requireSigned: true,
      })
    ).toBe("https://example.com/api/oauth/callback");
  });

  it("rejects legacy unsigned state when signed state is required", () => {
    const state = Buffer.from("https://example.com/api/oauth/callback").toString(
      "base64"
    );

    expect(() =>
      parseOAuthRedirectUriFromState(state, {
        secret: stateSecret,
        requireSigned: true,
      })
    ).toThrow(/must be signed/i);
  });

  it("rejects expired signed OAuth callback state", () => {
    const state = createOAuthState("https://example.com/api/oauth/callback", {
      now: 1_000,
      secret: stateSecret,
    });

    expect(() =>
      parseOAuthRedirectUriFromState(state, {
        now: 1_000 + 11 * 60 * 1000,
        secret: stateSecret,
        requireSigned: true,
      })
    ).toThrow(/expired/i);
  });

  it("accepts a valid OAuth callback state", () => {
    const state = Buffer.from("https://example.com/api/oauth/callback").toString(
      "base64"
    );

    expect(parseOAuthRedirectUriFromState(state)).toBe(
      "https://example.com/api/oauth/callback"
    );
  });

  it("rejects non-base64 state values", () => {
    expect(() => parseOAuthRedirectUriFromState("not base64")).toThrow(
      /not valid Base64/i
    );
  });

  it("rejects non-local http callback states", () => {
    const state = Buffer.from("http://example.com/api/oauth/callback").toString(
      "base64"
    );

    expect(() => parseOAuthRedirectUriFromState(state)).toThrow(
      /only use http for local callback hosts/i
    );
  });

  it("allows local http callback states for development", () => {
    const state = Buffer.from(
      "http://localhost:3000/api/oauth/callback"
    ).toString("base64");

    expect(parseOAuthRedirectUriFromState(state)).toBe(
      "http://localhost:3000/api/oauth/callback"
    );
  });

  it("rejects callback paths that do not match the expected route", () => {
    const state = Buffer.from("https://example.com/api/oauth/other").toString(
      "base64"
    );

    expect(() => parseOAuthRedirectUriFromState(state)).toThrow(
      /unexpected callback path/i
    );
  });
});

import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import {
  assertHostedProductionSecret,
  isLocalDesktopMode,
} from "./secretPolicy";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
const OAUTH_CALLBACK_PATH = "/api/oauth/callback";
const MAX_STATE_LENGTH = 2048;
const MAX_STATE_REDIRECT_URI_LENGTH = 2048;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const LOCAL_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type OAuthStartupLogEntry = {
  level: "info" | "error";
  args: [string, ...unknown[]];
};

export function getOAuthStartupLogEntry(
  oAuthServerUrl = ENV.oAuthServerUrl,
  localDesktopMode = isLocalDesktopMode()
): OAuthStartupLogEntry {
  const configuredUrl = oAuthServerUrl.trim();
  if (configuredUrl.length > 0) {
    return {
      level: "info",
      args: ["[OAuth] Initialized with baseURL:", configuredUrl],
    };
  }

  if (localDesktopMode) {
    return {
      level: "info",
      args: [
        "[OAuth] External OAuth disabled in local desktop mode; using local desktop session.",
      ],
    };
  }

  return {
    level: "error",
    args: [
      "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.",
    ],
  };
}

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    const startupLogEntry = getOAuthStartupLogEntry();
    if (startupLogEntry.level === "error") {
      console.error(...startupLogEntry.args);
    } else {
      console.log(...startupLogEntry.args);
    }
  }

  async getTokenByCode(
    code: string,
    state: string,
    redirectUriOverride?: string
  ): Promise<ExchangeTokenResponse> {
    const redirectUri = redirectUriOverride ?? parseOAuthRedirectUriFromState(state);

    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

export class OAuthStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateValidationError";
  }
}

type OAuthStatePayload = {
  redirectUri: string;
  nonce: string;
  issuedAt: number;
};

type OAuthStateOptions = {
  now?: number;
  secret?: string;
  requireSigned?: boolean;
};

function getOAuthStateSecret(secret = ENV.cookieSecret): string {
  if (!isNonEmptyString(secret)) {
    throw new OAuthStateValidationError("OAuth state secret is not configured");
  }
  return secret;
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8"
  );
}

function signStatePayload(payload: string, secret: string): string {
  return toBase64Url(createHmac("sha256", secret).update(payload).digest());
}

function validateOAuthRedirectUri(redirectUri: string): string {
  if (
    !isNonEmptyString(redirectUri) ||
    redirectUri.length > MAX_STATE_REDIRECT_URI_LENGTH
  ) {
    throw new OAuthStateValidationError(
      "OAuth state contains an invalid redirect URI"
    );
  }

  let parsedUri: URL;
  try {
    parsedUri = new URL(redirectUri);
  } catch {
    throw new OAuthStateValidationError("OAuth state must contain a valid URL");
  }

  if (!["http:", "https:"].includes(parsedUri.protocol)) {
    throw new OAuthStateValidationError(
      "OAuth state must use http or https protocol"
    );
  }

  if (
    parsedUri.protocol === "http:" &&
    !LOCAL_REDIRECT_HOSTS.has(parsedUri.hostname)
  ) {
    throw new OAuthStateValidationError(
      "OAuth state may only use http for local callback hosts"
    );
  }

  if (parsedUri.pathname !== OAUTH_CALLBACK_PATH) {
    throw new OAuthStateValidationError(
      "OAuth state has an unexpected callback path"
    );
  }

  return parsedUri.toString();
}

function parseLegacyOAuthState(state: string): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(state)) {
    throw new OAuthStateValidationError("OAuth state is not valid Base64");
  }

  if (state.length % 4 !== 0) {
    throw new OAuthStateValidationError("OAuth state must use base64 padding");
  }

  let redirectUri: string;
  try {
    redirectUri = Buffer.from(state, "base64").toString("utf8");
  } catch {
    throw new OAuthStateValidationError("OAuth state is not valid Base64");
  }

  return validateOAuthRedirectUri(redirectUri);
}

function parseSignedOAuthState(state: string, options: OAuthStateOptions = {}): string {
  const [encodedPayload, signature, extra] = state.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new OAuthStateValidationError("OAuth state has invalid signed format");
  }

  const secret = getOAuthStateSecret(options.secret);
  const expectedSignature = signStatePayload(encodedPayload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new OAuthStateValidationError("OAuth state signature is invalid");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as OAuthStatePayload;
  } catch {
    throw new OAuthStateValidationError("OAuth state payload is invalid");
  }

  if (
    !isNonEmptyString(payload.nonce) ||
    payload.nonce.length < 16 ||
    typeof payload.issuedAt !== "number"
  ) {
    throw new OAuthStateValidationError("OAuth state payload is incomplete");
  }

  const now = options.now ?? Date.now();
  if (payload.issuedAt > now + 60_000 || now - payload.issuedAt > OAUTH_STATE_TTL_MS) {
    throw new OAuthStateValidationError("OAuth state has expired");
  }

  return validateOAuthRedirectUri(payload.redirectUri);
}

export function createOAuthState(
  redirectUri: string,
  options: OAuthStateOptions = {}
): string {
  const payload: OAuthStatePayload = {
    redirectUri: validateOAuthRedirectUri(redirectUri),
    nonce: randomBytes(16).toString("hex"),
    issuedAt: options.now ?? Date.now(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload, getOAuthStateSecret(options.secret));
  const state = `${encodedPayload}.${signature}`;

  if (state.length > MAX_STATE_LENGTH) {
    throw new OAuthStateValidationError("OAuth state is too long");
  }

  return state;
}

export function parseOAuthRedirectUriFromState(
  state: string,
  options: OAuthStateOptions = {}
): string {
  if (!isNonEmptyString(state)) {
    throw new OAuthStateValidationError("OAuth state is required");
  }

  if (state.length > MAX_STATE_LENGTH) {
    throw new OAuthStateValidationError("OAuth state is too long");
  }

  if (state.includes(".")) {
    return parseSignedOAuthState(state, options);
  }

  if (options.requireSigned) {
    throw new OAuthStateValidationError("OAuth state must be signed");
  }

  return parseLegacyOAuthState(state);
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    redirectUriOverride?: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state, redirectUriOverride);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret && ENV.isProduction) {
      throw new Error("JWT_SECRET must be configured for production sessions");
    }
    assertHostedProductionSecret("JWT_SECRET", secret, "sessions");
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<User> {
    // Regular authentication flow
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // If user not in DB, sync from OAuth server automatically
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();

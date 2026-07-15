import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import {
  createOAuthState,
  OAuthStateValidationError,
  parseOAuthRedirectUriFromState,
  sdk,
} from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    try {
      if (!ENV.oAuthPortalUrl || !ENV.appId) {
        res.status(500).json({ error: "OAuth login is not configured" });
        return;
      }

      const expectedHost = req.get("host");
      if (!expectedHost) {
        throw new OAuthStateValidationError("Missing login host");
      }

      const redirectUri = `${req.protocol}://${expectedHost}/api/oauth/callback`;
      const state = createOAuthState(redirectUri);
      const url = new URL("/app-auth", ENV.oAuthPortalUrl);

      url.searchParams.set("appId", ENV.appId);
      url.searchParams.set("redirectUri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("type", "signIn");

      res.redirect(302, url.toString());
    } catch (error) {
      if (error instanceof OAuthStateValidationError) {
        console.warn("[OAuth] Login state creation failed", error.message);
        res.status(400).json({ error: error.message });
        return;
      }
      console.error("[OAuth] Login redirect failed", error);
      res.status(500).json({ error: "OAuth login failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const redirectUri = parseOAuthRedirectUriFromState(state, {
        requireSigned: true,
      });
      const expectedHost = req.get("host");
      if (!expectedHost) {
        throw new OAuthStateValidationError("Missing callback host");
      }
      const expectedOrigin = `${req.protocol}://${expectedHost}`;
      const decodedOrigin = new URL(redirectUri).origin;
      if (decodedOrigin !== expectedOrigin) {
        throw new OAuthStateValidationError("OAuth callback state host mismatch");
      }

      const tokenResponse = await sdk.exchangeCodeForToken(
        code,
        state,
        redirectUri
      );
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      if (error instanceof OAuthStateValidationError) {
        console.warn("[OAuth] Invalid callback state", error.message);
        res.status(400).json({ error: error.message });
        return;
      }
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

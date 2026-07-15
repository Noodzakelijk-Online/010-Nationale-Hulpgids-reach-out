import { afterEach, describe, expect, it } from "vitest";
import { validateDeploymentConfig } from "./deploymentConfig";

const previousEnv = {
  JWT_SECRET: process.env.JWT_SECRET,
  LOCAL_DESKTOP_MODE: process.env.LOCAL_DESKTOP_MODE,
  NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN,
  NGROK_ENABLED: process.env.NGROK_ENABLED,
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

function setHostedProductionEnv() {
  process.env.NODE_ENV = "production";
  delete process.env.LOCAL_DESKTOP_MODE;
  process.env.JWT_SECRET =
    "test-only-hosted-session-secret-with-enough-length";
  process.env.VITE_APP_ID = "reachout-test-app";
  process.env.OAUTH_SERVER_URL = "https://oauth.example.test";
}

afterEach(() => {
  restoreEnv();
});

describe("deployment configuration validation", () => {
  it("does not require hosted OAuth settings for local desktop production", () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_DESKTOP_MODE = "1";
    delete process.env.JWT_SECRET;
    delete process.env.VITE_APP_ID;
    delete process.env.OAUTH_SERVER_URL;

    expect(validateDeploymentConfig()).toEqual({
      status: "local-or-development",
    });
  });

  it("requires OAuth app id and HTTPS OAuth server URL for hosted production", () => {
    setHostedProductionEnv();
    delete process.env.VITE_APP_ID;

    expect(() => validateDeploymentConfig()).toThrow(/VITE_APP_ID/);

    process.env.VITE_APP_ID = "reachout-test-app";
    process.env.OAUTH_SERVER_URL = "http://oauth.example.test";

    expect(() => validateDeploymentConfig()).toThrow(/OAUTH_SERVER_URL.*HTTPS/);
  });

  it("requires an ngrok auth token before hosted ngrok startup", () => {
    setHostedProductionEnv();
    process.env.NGROK_ENABLED = "true";
    delete process.env.NGROK_AUTHTOKEN;

    expect(() => validateDeploymentConfig()).toThrow(/NGROK_AUTHTOKEN/);
  });

  it("accepts a complete hosted ngrok deployment config", () => {
    setHostedProductionEnv();
    process.env.NGROK_ENABLED = "true";
    process.env.NGROK_AUTHTOKEN = "test-ngrok-token";

    expect(validateDeploymentConfig()).toEqual({
      status: "hosted-production",
      ngrokEnabled: true,
    });
  });
});

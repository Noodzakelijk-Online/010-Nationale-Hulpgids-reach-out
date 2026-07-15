import {
  assertHostedProductionSecret,
  isLocalDesktopMode,
} from "./secretPolicy";

export type DeploymentConfigValidationResult =
  | { status: "local-or-development" }
  | { status: "hosted-production"; ngrokEnabled: boolean };

function isEnabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function requireEnv(name: string, purpose: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for ${purpose}.`);
  }
  return value;
}

function requireHttpsUrl(name: string, purpose: string) {
  const value = requireEnv(name, purpose);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL for ${purpose}.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS for ${purpose}.`);
  }
  return value;
}

export function validateDeploymentConfig(): DeploymentConfigValidationResult {
  if (process.env.NODE_ENV !== "production" || isLocalDesktopMode()) {
    return { status: "local-or-development" };
  }

  assertHostedProductionSecret(
    "JWT_SECRET",
    process.env.JWT_SECRET,
    "sessions"
  );
  requireEnv("VITE_APP_ID", "hosted OAuth sessions");
  requireHttpsUrl("OAUTH_SERVER_URL", "hosted OAuth sessions");

  const ngrokEnabled = isEnabled(process.env.NGROK_ENABLED);
  if (ngrokEnabled) {
    requireEnv("NGROK_AUTHTOKEN", "ngrok tunnel startup");
  }

  return { status: "hosted-production", ngrokEnabled };
}

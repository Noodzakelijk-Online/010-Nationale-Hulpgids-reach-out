import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeHealth } from "./runtimeHealth";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  LOCAL_DESKTOP_MODE: process.env.LOCAL_DESKTOP_MODE,
  NGROK_ENABLED: process.env.NGROK_ENABLED,
};

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.LOCAL_DESKTOP_MODE = ORIGINAL_ENV.LOCAL_DESKTOP_MODE;
  process.env.NGROK_ENABLED = ORIGINAL_ENV.NGROK_ENABLED;
});

describe("runtime health", () => {
  it("reports local desktop mode without exposing secrets", () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_DESKTOP_MODE = "1";
    process.env.NGROK_ENABLED = "true";

    const health = getRuntimeHealth();

    expect(health.ok).toBe(true);
    expect(health.mode).toBe("local-desktop");
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(health.timestamp).toISOString()).not.toThrow();
    expect(JSON.stringify(health)).not.toMatch(/secret|token|key|password/i);
  });

  it("reports ngrok mode for hosted tunnel runs", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_DESKTOP_MODE;
    process.env.NGROK_ENABLED = "true";

    expect(getRuntimeHealth().mode).toBe("ngrok");
  });
});

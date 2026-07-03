import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const forwardMock = vi.hoisted(() => vi.fn());

vi.mock("@ngrok/ngrok", () => ({
  forward: forwardMock,
}));

import { startNgrokTunnel } from "./ngrok";

const previousEnv = {
  LOCAL_DESKTOP_MODE: process.env.LOCAL_DESKTOP_MODE,
  NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN,
  NGROK_DOMAIN: process.env.NGROK_DOMAIN,
  NGROK_ENABLED: process.env.NGROK_ENABLED,
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

describe("ngrok tunnel startup policy", () => {
  beforeEach(() => {
    restoreEnv();
    forwardMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("does nothing when ngrok is not enabled", async () => {
    delete process.env.NGROK_ENABLED;

    const result = await startNgrokTunnel(3000);

    expect(result).toEqual({ status: "disabled" });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("refuses to expose local desktop mode", async () => {
    process.env.NGROK_ENABLED = "true";
    process.env.NGROK_AUTHTOKEN = "test-token";
    process.env.LOCAL_DESKTOP_MODE = "1";

    const result = await startNgrokTunnel(3000);

    expect(result).toEqual({ status: "blocked-desktop" });
    expect(forwardMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Refusing to expose local desktop mode")
    );
  });

  it("does not start a public tunnel without an auth token", async () => {
    process.env.NGROK_ENABLED = "1";
    delete process.env.NGROK_AUTHTOKEN;
    delete process.env.LOCAL_DESKTOP_MODE;

    const result = await startNgrokTunnel(3000);

    expect(result).toEqual({ status: "missing-token" });
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("starts ngrok with the configured local port and reserved domain", async () => {
    process.env.NGROK_ENABLED = "true";
    process.env.NGROK_AUTHTOKEN = "test-token";
    process.env.NGROK_DOMAIN = "reachout.example.ngrok.app";
    delete process.env.LOCAL_DESKTOP_MODE;
    forwardMock.mockResolvedValue({
      url: () => "https://reachout.example.ngrok.app",
    });

    const result = await startNgrokTunnel(39410);

    expect(result).toEqual({
      status: "started",
      url: "https://reachout.example.ngrok.app",
    });
    expect(forwardMock).toHaveBeenCalledWith({
      addr: 39410,
      authtoken: "test-token",
      domain: "reachout.example.ngrok.app",
    });
  });
});

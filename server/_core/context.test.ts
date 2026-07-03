import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("../db", () => ({
  getUserByOpenId: mocks.getUserByOpenId,
  upsertUser: mocks.upsertUser,
}));

vi.mock("./sdk", () => ({
  sdk: {
    authenticateRequest: mocks.authenticateRequest,
  },
}));

import { createContext, resetLocalDesktopUserCacheForTests } from "./context";

const ORIGINAL_LOCAL_DESKTOP_MODE = process.env.LOCAL_DESKTOP_MODE;

const localUser = {
  id: 1,
  openId: "local-desktop-user",
  name: "Local User",
  email: "local@nationalehulpgids.local",
  loginMethod: "desktop",
  role: "user",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  lastSignedIn: new Date("2026-01-01T00:00:00.000Z"),
} satisfies User;

const hostedUser = {
  ...localUser,
  id: 2,
  openId: "hosted-user",
  email: "hosted@example.com",
  loginMethod: "manus",
} satisfies User;

function contextOptions() {
  return {
    req: {} as any,
    res: {} as any,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLocalDesktopUserCacheForTests();
});

afterEach(() => {
  process.env.LOCAL_DESKTOP_MODE = ORIGINAL_LOCAL_DESKTOP_MODE;
  resetLocalDesktopUserCacheForTests();
});

describe("createContext", () => {
  it("reuses the local desktop user without writing on every request", async () => {
    process.env.LOCAL_DESKTOP_MODE = "1";
    mocks.getUserByOpenId.mockResolvedValue(localUser);

    const firstContext = await createContext(contextOptions());
    const secondContext = await createContext(contextOptions());

    expect(firstContext.user).toEqual(localUser);
    expect(secondContext.user).toEqual(localUser);
    expect(mocks.upsertUser).toHaveBeenCalledTimes(1);
    expect(mocks.getUserByOpenId).toHaveBeenCalledTimes(1);
    expect(mocks.authenticateRequest).not.toHaveBeenCalled();
  });

  it("uses hosted request authentication outside local desktop mode", async () => {
    delete process.env.LOCAL_DESKTOP_MODE;
    mocks.authenticateRequest.mockResolvedValue(hostedUser);

    const context = await createContext(contextOptions());

    expect(context.user).toEqual(hostedUser);
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
    expect(mocks.authenticateRequest).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  authUserStorageKeys,
  clearAuthUserSummary,
  persistAuthUserSummary,
} from "./authStorage";

function createMemoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("auth user storage", () => {
  it("stores only a minimal user summary under versioned and legacy keys", () => {
    const storage = createMemoryStorage();

    persistAuthUserSummary(
      {
        id: 7,
        name: "Robert",
        email: "robert@example.test",
        openId: "provider-sensitive-id",
        role: "admin",
      } as any,
      storage
    );

    const current = storage.entries.get(authUserStorageKeys.current);
    const legacy = storage.entries.get(authUserStorageKeys.legacyManus);

    expect(current).toBe(legacy);
    expect(JSON.parse(current!)).toEqual({
      id: 7,
      name: "Robert",
      email: "robert@example.test",
    });
    expect(current).not.toContain("provider-sensitive-id");
    expect(current).not.toContain("admin");
  });

  it("clears both keys on logout", () => {
    const storage = createMemoryStorage();
    persistAuthUserSummary({ id: 1, name: "Local", email: null }, storage);

    clearAuthUserSummary(storage);

    expect(storage.entries.has(authUserStorageKeys.current)).toBe(false);
    expect(storage.entries.has(authUserStorageKeys.legacyManus)).toBe(false);
  });

  it("does not throw when storage fails", () => {
    const storage = {
      removeItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
    };

    expect(() =>
      persistAuthUserSummary({ id: 1, name: "Local", email: null }, storage)
    ).not.toThrow();
    expect(() => clearAuthUserSummary(storage)).not.toThrow();
  });
});

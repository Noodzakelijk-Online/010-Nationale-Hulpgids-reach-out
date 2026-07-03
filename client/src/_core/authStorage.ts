const AUTH_USER_STORAGE_KEY = "reachout.auth-user:v1";
const LEGACY_MANUS_USER_STORAGE_KEY = "manus-runtime-user-info";

type StorageLike = Pick<Storage, "removeItem" | "setItem">;

export type AuthUserStorageInput = {
  id?: number | null;
  name?: string | null;
  email?: string | null;
};

function getBrowserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function buildStoredUser(user: AuthUserStorageInput) {
  return {
    id: user.id ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
  };
}

export function persistAuthUserSummary(
  user: AuthUserStorageInput | null | undefined,
  storage: StorageLike | undefined = getBrowserStorage()
) {
  if (!storage) return;

  try {
    if (!user) {
      storage.removeItem(AUTH_USER_STORAGE_KEY);
      storage.removeItem(LEGACY_MANUS_USER_STORAGE_KEY);
      return;
    }

    const serialized = JSON.stringify(buildStoredUser(user));
    storage.setItem(AUTH_USER_STORAGE_KEY, serialized);
    storage.setItem(LEGACY_MANUS_USER_STORAGE_KEY, serialized);
  } catch {
    // Disabled storage, private browsing, or quota limits must not break auth.
  }
}

export function clearAuthUserSummary(
  storage: StorageLike | undefined = getBrowserStorage()
) {
  persistAuthUserSummary(null, storage);
}

export const authUserStorageKeys = {
  current: AUTH_USER_STORAGE_KEY,
  legacyManus: LEGACY_MANUS_USER_STORAGE_KEY,
};

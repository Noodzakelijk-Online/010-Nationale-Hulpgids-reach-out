import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const LOCAL_DESKTOP_OPEN_ID = "local-desktop-user";
let cachedLocalDesktopUser: User | null = null;

function isLocalDesktopMode() {
  return (
    process.env.LOCAL_DESKTOP_MODE === "1" ||
    process.env.LOCAL_DESKTOP_MODE === "true"
  );
}

async function getLocalDesktopUser() {
  if (cachedLocalDesktopUser) return cachedLocalDesktopUser;

  await upsertUser({
    openId: LOCAL_DESKTOP_OPEN_ID,
    name: "Local User",
    email: "local@nationalehulpgids.local",
    loginMethod: "desktop",
    lastSignedIn: new Date(),
  });

  cachedLocalDesktopUser = (await getUserByOpenId(LOCAL_DESKTOP_OPEN_ID)) ?? null;
  return cachedLocalDesktopUser;
}

export function resetLocalDesktopUserCacheForTests() {
  cachedLocalDesktopUser = null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (isLocalDesktopMode()) {
    user = await getLocalDesktopUser();
  }

  try {
    user = user ?? await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = user ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

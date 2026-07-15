type NgrokModule = typeof import("@ngrok/ngrok");
type NgrokForwardHandle = {
  close(): Promise<void> | void;
  url(): string;
};

export type NgrokTunnelStartResult =
  | { status: "disabled" }
  | { status: "blocked-desktop" }
  | { status: "missing-token" }
  | { status: "started"; url: string }
  | { status: "failed"; error: unknown };

let activeListener: NgrokForwardHandle | null = null;

function isNgrokEnabled() {
  return (
    process.env.NGROK_ENABLED === "1" || process.env.NGROK_ENABLED === "true"
  );
}

export async function startNgrokTunnel(
  port: number
): Promise<NgrokTunnelStartResult> {
  if (!isNgrokEnabled()) return { status: "disabled" };

  if (
    process.env.LOCAL_DESKTOP_MODE === "1" ||
    process.env.LOCAL_DESKTOP_MODE === "true"
  ) {
    console.warn(
      "[ngrok] Refusing to expose local desktop mode. Disable LOCAL_DESKTOP_MODE before enabling ngrok."
    );
    return { status: "blocked-desktop" };
  }

  const authtoken = process.env.NGROK_AUTHTOKEN?.trim();
  if (!authtoken) {
    console.warn(
      "[ngrok] NGROK_ENABLED is set, but NGROK_AUTHTOKEN is missing. Skipping public tunnel."
    );
    return { status: "missing-token" };
  }

  try {
    const domain = process.env.NGROK_DOMAIN?.trim();
    const ngrok = (await import("@ngrok/ngrok")) as NgrokModule;
    const listener = await ngrok.forward({
      addr: port,
      authtoken: authtoken.trim(),
      domain: domain || undefined,
    });
    activeListener = listener as NgrokForwardHandle;
    const url = listener.url();
    if (!url) {
      throw new Error("ngrok listener did not return a public URL.");
    }
    console.log(`[ngrok] Public URL: ${url}`);
    return { status: "started", url };
  } catch (error) {
    console.error("[ngrok] Failed to start tunnel:", error);
    return { status: "failed", error };
  }
}

export async function stopNgrokTunnel() {
  if (!activeListener) return;
  const listener = activeListener;
  activeListener = null;

  await listener.close();
}

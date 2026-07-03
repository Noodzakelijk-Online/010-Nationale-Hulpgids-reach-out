export function getRuntimeHealth() {
  return {
    ok: true,
    mode: getRuntimeMode(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

function getRuntimeMode() {
  if (
    process.env.LOCAL_DESKTOP_MODE === "1" ||
    process.env.LOCAL_DESKTOP_MODE === "true"
  ) {
    return "local-desktop";
  }
  if (
    process.env.NGROK_ENABLED === "1" ||
    process.env.NGROK_ENABLED === "true"
  ) {
    return "ngrok";
  }
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

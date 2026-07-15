const MIN_HOSTED_SECRET_LENGTH = 32;

export function isLocalDesktopMode() {
  return (
    process.env.LOCAL_DESKTOP_MODE === "1" ||
    process.env.LOCAL_DESKTOP_MODE === "true"
  );
}

export function assertHostedProductionSecret(
  name: string,
  value: string | undefined | null,
  purpose: string
) {
  if (process.env.NODE_ENV !== "production" || isLocalDesktopMode()) return;

  if (!value) {
    throw new Error(`${name} must be configured for production ${purpose}`);
  }

  if (value.trim().length < MIN_HOSTED_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_HOSTED_SECRET_LENGTH} characters for production ${purpose}`
    );
  }
}

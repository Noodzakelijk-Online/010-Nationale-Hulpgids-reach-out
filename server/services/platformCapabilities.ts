const AUTHENTICATED_AUTOMATION_PLATFORMS = new Set(["Nationale Hulpgids"]);

export function getPlatformCapability(platformName: string) {
  const supportsAuthenticatedAutomation =
    AUTHENTICATED_AUTOMATION_PLATFORMS.has(platformName);

  return {
    supportsAuthenticatedAutomation,
    publicDiscoveryAvailable: true,
    mode: supportsAuthenticatedAutomation ? "authenticated" : "public_only",
  } as const;
}

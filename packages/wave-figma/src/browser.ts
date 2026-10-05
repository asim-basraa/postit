/**
 * How the CLI launches Chromium: the given executable, and the machine's HTTPS
 * proxy when it has one. Chromium does not read HTTPS_PROXY itself, so without
 * this a page's hosted fonts and images fail to load behind a proxy, and a
 * measurement taken without them means nothing.
 */
export function launchOptions(executablePath?: string): { executablePath?: string; proxy?: { server: string; bypass?: string } } {
  const server = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const bypass = process.env.NO_PROXY ?? process.env.no_proxy;
  return {
    ...(executablePath ? { executablePath } : {}),
    ...(server ? { proxy: { server, ...(bypass ? { bypass } : {}) } } : {}),
  };
}

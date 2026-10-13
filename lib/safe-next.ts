/**
 * Where to send somebody after they sign in, if it is somewhere on this site.
 *
 * Only a path on this origin is accepted. Anything else (another host, a
 * protocol-relative "//evil.example", a backslash a browser would read as a
 * slash) falls back to the default, so the login form cannot be turned into an
 * open redirect that lends Post-it's address to somebody else's page.
 */
export function safeNext(value: unknown, fallback = "/spaces"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  // Control characters have no business in a path and some browsers strip
  // them, which can turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

import { INSPECTOR_SOURCE } from "@wave/inspector";

/**
 * The Wave inspector script, served from Post-it's own origin for the review
 * frame to load. It is the same for everybody and changes only with a deploy,
 * which the build query in the frame's script tag accounts for.
 */
export function GET() {
  return new Response(INSPECTOR_SOURCE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

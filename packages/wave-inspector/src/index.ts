/**
 * The Wave inspector: the script a host adds to a mockup it frames for review,
 * and the typed messages it exchanges with the host page.
 *
 * The host serves INSPECTOR_SOURCE from a route of its own (it must be
 * same-origin with the host, since the frame is sandboxed without
 * allow-same-origin and so cannot be given credentials) and adds a script tag
 * pointing at it with injectInspector.
 */
export { INSPECTOR_SOURCE } from "./source";
export * from "./protocol";

/** Adds the inspector script tag before </body>, or at the end if there is none. */
export function injectInspector(html: string, src: string): string {
  const safe = src.replace(/"/g, "&quot;");
  const tag = `\n<script src="${safe}" data-wave-inspector></script>\n`;
  const at = html.search(/<\/body\s*>/i);
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
}

/**
 * Wave prototypes: a feature's screens played as one working prototype, with
 * an MSW mock server made from its OpenAPI document.
 *
 * The host serves PROTOTYPE_SOURCE from a route of its own and adds it to each
 * screen it frames with injectPrototype (at the start of the head, so it is in
 * place before the page's own scripts call fetch). The viewer drives the frame
 * with the messages in protocol.ts.
 */
export { PROTOTYPE_SOURCE } from "./source";
export * from "./openapi";
export * from "./generate";
export * from "./protocol";

/** Adds the runtime script tag first thing in the head, so it patches fetch before the page's own scripts run. */
export function injectPrototype(html: string, src: string): string {
  const safe = src.replace(/"/g, "&quot;");
  const tag = `<script src="${safe}" data-wave-prototype></script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (htmlTag) return html.slice(0, htmlTag.index + htmlTag[0].length) + `<head>${tag}</head>` + html.slice(htmlTag.index + htmlTag[0].length);
  return tag + html;
}

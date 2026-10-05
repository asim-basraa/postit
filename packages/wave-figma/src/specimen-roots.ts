/** Each variant's root classes on its specimen page, by the variant's Figma id. */
export function specimenRoots(pages: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const classOf = (attrs: string) => {
    const cls = /\sclass="([^"]*)"/.exec(attrs);
    return cls ? cls[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";
  };
  for (const html of pages) {
    let variants = 0;
    // A published specimen's wrapper carries its Wave id first: the variant may be any attribute.
    for (const m of html.matchAll(/<div\s[^>]*?\bdata-figma-variant="([^"]+)"[^>]*>\s*<(\w+)([^>]*)>/g)) {
      out[m[1]] = classOf(m[3]);
      variants++;
    }
    // A component without variants: its root is the element carrying the component's own id.
    const source = /<meta name="figma-source" content="figma:[^/"]+\/([^"]+)">/.exec(html);
    if (!variants && source) {
      const root = new RegExp(`<\\w+([^>]*\\sdata-figma-id="${source[1]}"[^>]*)>`).exec(html);
      if (root) out[source[1]] = classOf(" " + root[1]);
    }
  }
  return out;
}

/** Each variant's root tag as Figma's code wrote it (before any upgrade), by the variant's Figma id. */
export function specimenTags(pages: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const html of pages)
    for (const m of html.matchAll(/<div\s[^>]*?\bdata-figma-variant="([^"]+)"[^>]*>\s*<(\w+)([^>]*)>/g)) {
      const was = /\sdata-wave-tag="(\w+)"/.exec(m[3]);
      out[m[1]] = was ? was[1] : m[2];
    }
  return out;
}

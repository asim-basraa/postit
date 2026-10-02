/**
 * Fonts for converted screens. Free families come from Google Fonts: the
 * stylesheet is read for each family and weight, the Latin woff2 files are
 * downloaded, and the agent uploads them to the project (upload_asset) so the
 * screen loads them from Post-it. A family Google does not serve is reported,
 * and the engineer is asked for the files.
 */

export type FontFile = { family: string; weight: number; style: string; url: string; unicodeRange: string | null };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function googleFontFiles(families: string[], weights: number[]): Promise<{ files: FontFile[]; missing: string[] }> {
  const files: FontFile[] = [];
  const missing: string[] = [];
  for (const family of families) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}&display=block`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) {
      missing.push(family);
      continue;
    }
    const css = await res.text();
    const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
    for (const [, subset, body] of blocks) {
      if (subset !== "latin") continue;
      files.push({
        family,
        weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1] ?? 400),
        style: /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal",
        url: /url\(([^)]+)\)/.exec(body)?.[1] ?? "",
        unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? null,
      });
    }
    if (!files.some((f) => f.family === family)) missing.push(family);
  }
  return { files, missing };
}

/** @font-face rules for a set of files, each at the URL given for it (an uploaded asset, or a data: URL). */
export function fontFaceCss(files: (FontFile & { src: string })[]): string {
  return files
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(${f.src}) format("woff2")${f.unicodeRange ? `;unicode-range:${f.unicodeRange}` : ""}}`,
    )
    .join("\n");
}

/** The file name a font is saved and uploaded under. */
export function fontFileName(f: FontFile): string {
  return `${f.family.replace(/\s+/g, "")}-${f.weight}${f.style === "italic" ? "i" : ""}.woff2`;
}

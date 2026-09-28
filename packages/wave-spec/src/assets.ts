import type { AssetRef } from "./parse";

/**
 * Where each file a mockup loads comes from.
 *
 * Wave's rule: images, icons, logos and fonts that belong to the design live
 * in the project's asset store in Post-it, so the mockup looks the same in
 * review, on a public link and in the handover. Links to other websites (a
 * stock photo, Google Fonts) are left as they are. Anything else (a local
 * path, an inline data: file, a blob:) has to be uploaded first.
 */

export type AssetStatus = "hosted" | "external" | "inline" | "local" | "other-project";

export type AssetIssue = {
  key: string;
  url: string;
  kind: AssetRef["kind"];
  pid?: string;
  status: AssetStatus;
  message: string;
};

/** The public address prefix assets of a project are served from. */
export function assetBaseUrl(origin: string, projectId: string): string {
  return `${origin.replace(/\/$/, "")}/a/${projectId}/`;
}

export function classifyAsset(url: string, base: string | null): AssetStatus {
  const u = url.trim();
  if (base && u.startsWith(base)) return "hosted";
  if (base) {
    const m = /^(https?:\/\/[^/]+)\/a\/[0-9a-f-]{36}\//i.exec(u);
    const origin = /^(https?:\/\/[^/]+)\//i.exec(base)?.[1];
    if (m && origin && m[1] === origin) return "other-project";
  }
  if (/^data:/i.test(u)) return "inline";
  if (/^(https?:)?\/\//i.test(u)) return "external";
  return "local";
}

function shorten(url: string): string {
  return url.startsWith("data:") ? `${url.slice(0, 30)}… (${Math.round(url.length / 1024)} KB inline)` : url.length > 90 ? `${url.slice(0, 87)}…` : url;
}

/** Every asset that is neither hosted in the project nor a link to another site. */
export function assetIssues(assets: AssetRef[], base: string | null): AssetIssue[] {
  const out: AssetIssue[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    const status = classifyAsset(a.url, base);
    if (status === "hosted" || status === "external") continue;
    const key = `asset:${a.url.startsWith("data:") ? `data:${a.url.length}:${a.url.slice(-24)}` : a.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      url: a.url,
      kind: a.kind,
      pid: a.pid,
      status,
      message:
        status === "inline"
          ? `An inline ${a.kind === "font" ? "font" : "image"} (${shorten(a.url)}) must be uploaded to the project's assets with upload_asset, and the HTML pointed at the hosted address.`
          : status === "other-project"
            ? `${shorten(a.url)} is hosted in another project. Upload it to this one.`
            : `${shorten(a.url)} is a local file. Upload it with upload_asset and point the HTML at the hosted address.`,
    });
  }
  return out;
}

/** The asset types the store accepts. No video. */
export const ASSET_TYPES: Record<string, { ext: string; mime: string }> = {
  png: { ext: "png", mime: "image/png" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  gif: { ext: "gif", mime: "image/gif" },
  webp: { ext: "webp", mime: "image/webp" },
  avif: { ext: "avif", mime: "image/avif" },
  svg: { ext: "svg", mime: "image/svg+xml" },
  ico: { ext: "ico", mime: "image/x-icon" },
  woff2: { ext: "woff2", mime: "font/woff2" },
  woff: { ext: "woff", mime: "font/woff" },
  ttf: { ext: "ttf", mime: "font/ttf" },
  otf: { ext: "otf", mime: "font/otf" },
};

export const ASSET_MAX_BYTES = 10 * 1024 * 1024;

/** The type of a file from its first bytes, or null when it is not one the store takes. */
export function sniffAsset(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return ASSET_TYPES.png;
  if (at(0, 0xff, 0xd8, 0xff)) return ASSET_TYPES.jpeg;
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return ASSET_TYPES.gif;
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return ASSET_TYPES.webp;
  if (at(4, 0x66, 0x74, 0x79, 0x70) && (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73))) return ASSET_TYPES.avif;
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return ASSET_TYPES.ico;
  if (at(0, 0x77, 0x4f, 0x46, 0x32)) return ASSET_TYPES.woff2;
  if (at(0, 0x77, 0x4f, 0x46, 0x46)) return ASSET_TYPES.woff;
  if (at(0, 0x00, 0x01, 0x00, 0x00) || at(0, 0x74, 0x72, 0x75, 0x65)) return ASSET_TYPES.ttf;
  if (at(0, 0x4f, 0x54, 0x54, 0x4f)) return ASSET_TYPES.otf;
  const head = new TextDecoder().decode(b.slice(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return ASSET_TYPES.svg;
  return null;
}

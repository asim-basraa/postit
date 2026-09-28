import { parseMockup, type Finding } from "@wave/spec";
import type { ScreenVersion, WaveHost, WaveScreen } from "./host";

/**
 * What each version of a screen says about itself.
 *
 * Every save of a screen, from any door the host has (an editor, an upload, an
 * agent, an attribute edit in the review panel), should end in
 * recordScreenVersion. It keeps a copy of that version's bytes and what the
 * spec parser read out of them. The copy is what makes old versions,
 * comparison and frozen approvals possible, since a host usually overwrites a
 * file in place; the index is a cache, rebuilt from the copy when missing.
 */

/** Stored CSS is capped: it only feeds the off-token check. */
const CSS_CAP = 200_000;

/**
 * Records one version. Never throws: a missing index is rebuilt the next time
 * anybody looks, and refusing somebody's save because a cache could not be
 * written would be the wrong way round.
 */
export async function recordScreenVersion(
  host: WaveHost,
  screenId: string,
  version: number,
  html: string,
): Promise<{ findings: Finding[]; version: ScreenVersion | null }> {
  try {
    const previous = await host.store.previousNodes(screenId, version);
    // The same version recorded again (an append grows a file without moving
    // its version) replaces the copy; the old one would be left behind.
    const same = await host.store.version(screenId, version);
    const parsed = parseMockup(html, previous ? { nodes: previous } : undefined);
    const snapshot = await host.blobs.putSnapshot(screenId, version, html);

    let cssTotal = 0;
    const css: string[] = [];
    for (const block of parsed.css) {
      if (cssTotal + block.length > CSS_CAP) break;
      css.push(block);
      cssTotal += block.length;
    }

    const saved = await host.store.saveVersion({
      screen_id: screenId,
      content_version: version,
      snapshot_key: snapshot,
      screen: parsed.screen,
      nodes: parsed.nodes,
      findings: parsed.findings,
      extras: { css, unidentified: parsed.unidentifiedInteractive },
      updated_at: new Date().toISOString(),
    });

    if (saved.error) console.error("wave: recording %s v%d failed: %s", screenId, version, saved.error);
    else if (same?.snapshot_key && same.snapshot_key !== snapshot) await host.blobs.remove(same.snapshot_key);
    return { findings: parsed.findings, version: saved.version };
  } catch (e) {
    console.error("wave: recording %s v%d failed: %s", screenId, version, (e as Error).message);
    return { findings: [], version: null };
  }
}

/**
 * The index of a screen's current version, making it if it is missing: a
 * screen saved before Wave was added, or a save whose index failed to write.
 */
export async function ensureVersion(host: WaveHost, screen: WaveScreen): Promise<ScreenVersion | null> {
  const existing = await host.store.version(screen.id, screen.content_version);
  if (existing?.snapshot_key) return existing;
  const html = await host.resources.readCurrent(screen);
  if (html === null) return existing;
  const { version } = await recordScreenVersion(host, screen.id, screen.content_version, html);
  if (version) return version;

  // A reader who may not edit cannot write the index, but can still be shown
  // one, read from the bytes they are already allowed to see.
  const parsed = parseMockup(html);
  const now = new Date().toISOString();
  return {
    id: "",
    screen_id: screen.id,
    content_version: screen.content_version,
    snapshot_key: null,
    screen: parsed.screen,
    nodes: parsed.nodes,
    findings: parsed.findings,
    extras: { css: parsed.css, unidentified: parsed.unidentifiedInteractive },
    created_at: now,
    updated_at: now,
  };
}

/** The bytes of one version, or null. */
export async function versionHtml(host: WaveHost, screen: WaveScreen, version: number): Promise<string | null> {
  if (version === screen.content_version) return host.resources.readCurrent(screen);
  const v = await host.store.version(screen.id, version);
  return v?.snapshot_key ? host.blobs.read(v.snapshot_key) : null;
}

/** Findings as a few lines of text, for an agent's answer. */
export function describeFindings(findings: Finding[]): string {
  if (findings.length === 0) return "Validation: no findings.";
  const order = { error: 0, warn: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return [
    `Validation: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`,
    ...sorted.map((f) => `- [${f.severity}] ${f.code}${f.pid ? ` (${f.pid})` : ""}: ${f.message}`),
  ].join("\n");
}

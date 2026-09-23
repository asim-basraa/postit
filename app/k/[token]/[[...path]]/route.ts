import { NextResponse, type NextRequest } from "next/server";
import { resolveSession } from "@/lib/mcp/session";
import {
  layOutSkillset,
  readableSkills,
  skillsetArchive,
  type SkillRow,
} from "@/lib/skills";

export const dynamic = "force-dynamic";

/**
 * Skillsets, as files, for the installers that only speak HTTPS.
 *
 *   /k/<token>                         what this token can reach
 *   /k/<token>/<slug>                  the whole skillset, gzipped tar
 *   /k/<token>/<slug>.tar.gz           the same thing, named so a client can
 *                                      tell what it is from the URL alone
 *   /k/<token>/<slug>/<skill>/SKILL.md one skill on its own
 *
 * The token is an ordinary MCP token and the session it opens is the ordinary
 * one: it acts as its owner with RLS applied, so what comes back here is
 * exactly what that person could open in a browser. Sharing a skillset with
 * somebody and sharing a single skill out of one both work without a line of
 * code here knowing the difference, which is the point — this route decides
 * nothing about access, it only changes rows into files.
 *
 * Be clear about what the token in the path costs, because it is the same
 * trade /api/mcp/<token> already makes and for the same reason: no installer
 * in this ecosystem offers a field for a header. A secret in a path is in
 * every log that records paths, in whatever the client writes to disk, and in
 * any chat window the URL is subsequently pasted into. Pin the token to the
 * one skillset when you make it, so a leak costs that and not an account.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path = [] } = await params;

  const session = await resolveSession(token);
  // An unknown token and a skillset that is not there are the same answer, as
  // everywhere else in this product.
  if (!session) return missing();

  if (path.length === 0) return index(session, token);

  const slug = path[0].replace(/\.tar\.gz$/, "").replace(/\.tgz$/, "");
  const space = await skillsetBySlug(session, slug);
  if (!space) return missing();

  const skills = await readableSkills(session.supabase, space.id);
  // Nothing readable in it is indistinguishable from no such skillset. A
  // skillset you were never given must not answer differently from one that
  // does not exist.
  if (skills.length === 0) return missing();

  if (path.length === 1) return archive(space.slug, skills);

  // The only thing inside a skillset is a skill folder holding a SKILL.md.
  if (path.length !== 3 || path[2] !== "SKILL.md") return missing();
  return oneSkill(path[1], skills);
}

type Session = NonNullable<Awaited<ReturnType<typeof resolveSession>>>;

/**
 * The skillset at this address, if this token may have it.
 *
 * Three conditions and they are not the same: the space has to exist, it has
 * to be marked a skillset, and RLS has to let this caller see it. Only the
 * last is about permission, and it is the one not written here.
 */
async function skillsetBySlug(
  session: Session,
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const { data } = await session.supabase
    .from("spaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_skillset", true)
    .maybeSingle();

  if (!data) return null;
  // A token pinned to one space reaches that space and nothing else, exactly
  // as it does over MCP.
  if (session.spaceId && session.spaceId !== data.id) return null;
  return data;
}

/**
 * What this token can reach.
 *
 * For the person who pasted the URL into a browser to see whether it works,
 * and for a client that would rather ask than be told. The addresses it gives
 * back carry the token that was presented, because that is the URL the caller
 * already holds; it learns nothing from being handed its own secret.
 */
async function index(session: Session, token: string) {
  let query = session.supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("is_skillset", true);

  // A pinned token reaches one space, so it should be told about one space.
  if (session.spaceId) query = query.eq("id", session.spaceId);

  const { data } = await query.order("name");
  const rows = (data ?? []) as { slug: string; name: string }[];

  return NextResponse.json(
    {
      skillsets: rows.map((row) => ({
        name: row.name,
        slug: row.slug,
        archive: `/k/${token}/${row.slug}.tar.gz`,
      })),
    },
    { headers: PRIVATE },
  );
}

function archive(slug: string, skills: SkillRow[]) {
  const body = skillsetArchive(skills);

  // Stripped rather than trusted. This is the space's own slug and a slug is
  // lowercase letters, numbers and hyphens, so in practice nothing is removed
  // — but it is about to be interpolated into a header, and a header built
  // from anything that came in over the wire gets checked on the way out.
  const safe = slug.replace(/[^a-z0-9-]/g, "") || "skillset";

  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE,
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${safe}.tar.gz"`,
    },
  });
}

function oneSkill(folder: string, skills: SkillRow[]) {
  const hit = layOutSkillset(skills).find((skill) => skill.folder === folder);
  if (!hit) return missing();

  return new NextResponse(hit.file, {
    headers: { ...PRIVATE, "content-type": "text/markdown; charset=utf-8" },
  });
}

/**
 * Never cached and never sniffed.
 *
 * no-store because what this answers depends on who asked, and a shared cache
 * that got that wrong would hand one person's skillset to another. nosniff
 * because the bodies are somebody else's writing and a browser guessing at
 * their type is how that writing gets to run.
 */
const PRIVATE = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
} as const;

function missing() {
  return new NextResponse("Not found.", {
    status: 404,
    headers: { ...PRIVATE, "content-type": "text/plain; charset=utf-8" },
  });
}

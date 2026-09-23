import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFrontmatter } from "@postit/renderer";
import { tarball, type TarEntry } from "@/lib/tar";

/**
 * A skillset, laid out the way the Agent Skills standard says.
 *
 * The standard is a folder per skill holding a SKILL.md, whose frontmatter
 * carries a name and a description, and whose body is the instructions. Post-it
 * has stored exactly that since skills existed; what was missing was a way for
 * anything outside Post-it to fetch it, because every installer in that
 * ecosystem speaks files over HTTPS and Post-it speaks rows.
 *
 * This module is that translation and nothing else. It decides no permissions:
 * the rows it is handed have already been through RLS, so a skill the caller
 * may not read never reaches it, and a skillset with nothing readable in it
 * lays out as empty and is served as a 404 like anything else.
 */

/** A skill as it comes out of the database. */
export type SkillRow = {
  id: string;
  name: string;
  slug: string;
  path: string;
  content: string | null;
};

export type LaidOutSkill = {
  /** The folder it goes in, which the standard says must be its name. */
  folder: string;
  description: string | null;
  /** The whole SKILL.md, frontmatter and body. */
  file: string;
};

/**
 * The longest folder name this will emit.
 *
 * A tar header holds 100 bytes of path and "/SKILL.md" spends ten of them.
 * Well short of that, because a skill's name is something a person types at a
 * prompt and a 90-character folder is nobody's idea of one.
 */
const MAX_FOLDER = 64;

/**
 * The same slug rule the database uses, in the same words.
 *
 * Deliberately a second copy, and the only one in the codebase, because these
 * two are not the same rule wearing different hats: that one names a node's
 * address, this one names a folder in somebody else's checkout. They agree
 * today and either may move without the other. See public.slugify.
 */
export function folderName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (slug || "untitled").slice(0, MAX_FOLDER).replace(/-+$/, "");
}

/**
 * Lays a set of skills out as folders.
 *
 * Two things happen here that are worth stating, because both are the
 * difference between a file that works and one an installer rejects.
 *
 * The folder is named from the frontmatter rather than from the page, because
 * the standard requires a skill's name and its folder to match, and it is the
 * frontmatter an agent reads. A page called "Invoicing (v2, final)" whose
 * frontmatter says `name: monthly-invoicing` becomes monthly-invoicing/, which
 * is what its author meant.
 *
 * And the frontmatter that goes out has its name rewritten to that folder, so
 * the two cannot disagree however the page was edited. Post-it is forgiving
 * about what it stores — a skill missing its metadata still saves, because
 * losing somebody's writing to a formatting rule is far worse than an
 * incomplete skill — but what it serves has to be valid, so this fills in a
 * missing name from the page's own. A missing description cannot be invented
 * and is left missing; the editor already says so where it can be fixed.
 */
export function layOutSkillset(skills: SkillRow[]): LaidOutSkill[] {
  const taken = new Set<string>();
  const out: LaidOutSkill[] = [];

  for (const skill of skills) {
    const { data, body } = parseFrontmatter(skill.content ?? "");
    const declared = data.name?.trim();

    let folder = folderName(declared || skill.name || skill.slug);
    // Two skills may reasonably be called the same thing in a space that never
    // had to think about folders. Suffixed rather than dropped: a skill that
    // silently does not arrive is the worst outcome available here.
    if (taken.has(folder)) {
      let n = 2;
      while (taken.has(`${folder}-${n}`)) n += 1;
      folder = `${folder}-${n}`;
    }
    taken.add(folder);

    const description = data.description?.trim() || null;
    out.push({ folder, description, file: skillFile(folder, data, body) });
  }

  return out;
}

/**
 * One SKILL.md.
 *
 * Every other frontmatter key the author wrote is carried through untouched
 * and in order, because the standard is open at the edges — license,
 * allowed-tools, whatever an agent adds next — and dropping a key we do not
 * happen to recognise would quietly break skills we have never heard of.
 *
 * Values go out as double-quoted scalars via JSON, which is not a shortcut:
 * JSON is a subset of YAML 1.2, so a description containing a colon, a hash or
 * a quote survives instead of producing a file that will not parse.
 */
function skillFile(
  folder: string,
  data: Record<string, string>,
  body: string,
): string {
  const lines = [`name: ${JSON.stringify(folder)}`];

  const description = data.description?.trim();
  if (description) lines.push(`description: ${JSON.stringify(description)}`);

  for (const [key, value] of Object.entries(data)) {
    if (key === "name" || key === "description") continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }

  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

/** The whole skillset as one gzipped tar, laid out as folders. */
export function skillsetArchive(skills: SkillRow[]): Buffer {
  const entries: TarEntry[] = layOutSkillset(skills).map((skill) => ({
    path: `${skill.folder}/SKILL.md`,
    body: skill.file,
  }));

  return tarball(entries);
}

/**
 * The skills in a space, through whatever the client's permissions are.
 *
 * The client is the caller's: an MCP token's, which acts as its owner with RLS
 * applied. So this returns the skills that person could open in a browser, and
 * a skillset shared as a whole and a single skill shared out of one both come
 * back as exactly what was shared. There is no filtering here to get wrong.
 */
export async function readableSkills(
  supabase: SupabaseClient,
  spaceId: string,
): Promise<SkillRow[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id, name, slug, path, content")
    .eq("space_id", spaceId)
    .eq("content_type", "skill")
    .order("path");

  if (error) return [];
  return (data ?? []) as SkillRow[];
}

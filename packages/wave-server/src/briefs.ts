import {
  DESIGN_PAGE,
  FEATURE_PAGE,
  designMdTemplate,
  featureMdTemplate,
  missingDesignSections,
  parseDesignMd,
  parseFeatureMd,
  slugify,
  type BriefProblem,
} from "@wave/spec";
import type { WaveHost } from "./host";

/**
 * DESIGN.md (one per project, at its root) and FEATURE.md (one per feature,
 * in its folder), read and saved through the host's documents. Saving checks
 * the front matter; a file whose settings cannot be read is refused, anything
 * else is saved with its problems listed so the skill can fix them.
 */

export type BriefFile = {
  kind: "design" | "feature";
  /** The folder it lives in: the project or the feature. */
  folderId: string;
  folderName: string;
  pageId: string | null;
  version: number | null;
  /** The saved Markdown, or a template when there is none yet. */
  content: string;
  exists: boolean;
  problems: BriefProblem[];
  /** DESIGN.md only: sections the prose does not have yet. */
  missingSections: string[];
};

export async function readDesignBrief(host: WaveHost, anyId: string): Promise<BriefFile | { error: string }> {
  const project = host.projects ? await host.projects.projectOf(anyId) : null;
  if (!project) return { error: "Not inside a Wave project. Make the folder a project first (set_project)." };
  const doc = host.documents ? await host.documents.read(project.id, DESIGN_PAGE) : null;
  const content = doc?.content ?? designMdTemplate(project.name);
  const parsed = parseDesignMd(content);
  return {
    kind: "design",
    folderId: project.id,
    folderName: project.name,
    pageId: doc?.id ?? null,
    version: doc?.version ?? null,
    content,
    exists: !!doc,
    problems: parsed.problems,
    missingSections: missingDesignSections(parsed),
  };
}

export async function readFeatureBrief(host: WaveHost, featureId: string): Promise<BriefFile | { error: string }> {
  const flow = await host.resources.flow(featureId);
  if (!flow) return { error: "Not a feature. Make the folder a feature first (set_flow)." };
  const doc = host.documents ? await host.documents.read(featureId, FEATURE_PAGE) : null;
  const content = doc?.content ?? featureMdTemplate(slugify(flow.name), flow.name);
  return {
    kind: "feature",
    folderId: featureId,
    folderName: flow.name,
    pageId: doc?.id ?? null,
    version: doc?.version ?? null,
    content,
    exists: !!doc,
    problems: parseFeatureMd(content).problems,
    missingSections: [],
  };
}

export type SaveBriefResult = { ok: true; id: string; problems: BriefProblem[]; missingSections: string[] } | { ok: false; error: string; problems: BriefProblem[] };

const unreadable = (problems: BriefProblem[]) => problems.find((p) => p.path === "");

export async function saveDesignBrief(host: WaveHost, anyId: string, markdown: string): Promise<SaveBriefResult> {
  const project = host.projects ? await host.projects.projectOf(anyId) : null;
  if (!project) return { ok: false, error: "Not inside a Wave project.", problems: [] };
  if (!host.documents) return { ok: false, error: "This host does not keep documents.", problems: [] };
  const parsed = parseDesignMd(markdown);
  const bad = unreadable(parsed.problems);
  if (bad) return { ok: false, error: bad.message, problems: parsed.problems };
  const w = await host.documents.write(project.id, DESIGN_PAGE, markdown);
  if (!w.ok) return { ok: false, error: w.error, problems: parsed.problems };
  return { ok: true, id: w.id, problems: parsed.problems, missingSections: missingDesignSections(parsed) };
}

export async function saveFeatureBrief(host: WaveHost, featureId: string, markdown: string): Promise<SaveBriefResult> {
  const flow = await host.resources.flow(featureId);
  if (!flow) return { ok: false, error: "Not a feature.", problems: [] };
  if (!host.documents) return { ok: false, error: "This host does not keep documents.", problems: [] };
  const parsed = parseFeatureMd(markdown);
  const bad = unreadable(parsed.problems);
  if (bad) return { ok: false, error: bad.message, problems: parsed.problems };
  const w = await host.documents.write(featureId, FEATURE_PAGE, markdown);
  if (!w.ok) return { ok: false, error: w.error, problems: parsed.problems };
  return { ok: true, id: w.id, problems: parsed.problems, missingSections: [] };
}

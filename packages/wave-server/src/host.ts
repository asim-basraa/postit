import type { Finding, ScreenMeta, SpecNode } from "@wave/spec";

/**
 * What Wave needs from the product it is embedded in.
 *
 * Wave has no users, no permissions and no file storage of its own. A host
 * (Post-it, Lighter, anything else) already has all three, and Wave borrows
 * them through this interface. One WaveHost is made per request, for the person
 * making it, so every answer the host gives is already filtered by what that
 * person may see and do. Wave never decides who may do what: it asks.
 *
 * The words: a screen is one HTML mockup the host stores; a flow is a
 * container of screens (a folder, a test, a project) reviewed and approved
 * together; a member is anything in a flow, a screen or a token file.
 */
export type WaveHost = {
  /** Who is asking, or null for nobody signed in. */
  viewer: { id: string; label: string | null } | null;
  resources: WaveResources;
  comments: WaveComments;
  blobs: WaveBlobs;
  /** Wave's own tables. @wave/db provides one for Supabase. */
  store: WaveStore;
  /** Projects: design system, tokens and features. Optional; without it Wave checks screens on their own. */
  projects?: WaveProjects;
  /** The project's public asset store. */
  assets?: WaveAssets;
  /** Text pages the host keeps (the question and answer sheets). */
  documents?: WaveDocuments;
  /** Each feature's (and project's) mock API: the OpenAPI document, mock files and data requirements page. */
  api?: WaveApiFiles;
  /** Where people open things, for the links agents hand out. */
  links?: WaveLinks;
};

/** A folder's mock API files, as the host keeps them. */
export type WaveApiFolder = {
  /** The OpenAPI document, JSON or YAML, as written. */
  openapi: { id: string; content: string; version: number } | null;
  /** Mock response bodies by name (an operationId), as JSON text. */
  mocks: Record<string, string>;
  /** The data requirements page, when there is one. */
  requirements: { id: string; content: string } | null;
};

export type WaveApiFiles = {
  /** A feature's or project's API files, or null when it has none. */
  read(folderId: string): Promise<WaveApiFolder | null>;
  /**
   * Writes some of them. Mock files not named are left alone; a mock given as
   * null is removed.
   */
  write(
    folderId: string,
    files: { openapi?: string; mocks?: Record<string, string | null>; requirements?: string },
  ): Promise<HostResult<{ written: string[] }>>;
};

export type WaveLinks = {
  screen(screenId: string): string;
  prototype(flowId: string): string;
};

/** A project: a folder holding its design system and its features. */
export type WaveProject = { id: string; name: string; path: string; [extra: string]: unknown };

export type WaveProjects = {
  /** The project a screen, feature or folder belongs to. */
  projectOf(id: string): Promise<WaveProject | null>;
  project(id: string): Promise<WaveProject | null>;
  setProject(id: string, isProject: boolean): Promise<HostResult>;
  /** The project's DTCG token file, if it has one. */
  tokens(projectId: string): Promise<{ id: string; content: string; version: number } | null>;
  /** The component specimen pages in the project's design system. */
  specimens(projectId: string): Promise<WaveScreen[]>;
  /** Every product screen in the project's features, with the version its review last approved. */
  screens(projectId: string): Promise<(WaveScreen & { flow_id: string | null; approved_version?: number | null })[]>;
  /** Where new specimen pages go (the components folder), creating it if needed. */
  componentsFolder(projectId: string): Promise<{ id: string; path: string } | null>;
  /**
   * The project's design-system folder, creating it if needed, where the
   * design-system page and its JSON go. pageBase, when the host has one, is the
   * address a page's path is appended to for a link people can open.
   */
  designSystemFolder?(projectId: string): Promise<{ id: string; path: string; pageBase: string | null } | null>;
};

export type WaveAsset = { hash: string; ext: string; mime: string; bytes: number; name: string; url: string; created_at: string };

export type WaveAssets = {
  /** The public address prefix for the project's assets, ending in a slash. */
  baseUrl(projectId: string): string;
  put(projectId: string, name: string, bytes: Uint8Array): Promise<HostResult<{ asset: WaveAsset; existing: boolean }>>;
  list(projectId: string): Promise<WaveAsset[]>;
  /** The bytes of one asset, for the handover. */
  read?(projectId: string, hash: string, ext: string): Promise<Uint8Array | null>;
};

export type WaveDocuments = {
  /** A page in the folder, or in its subfolder (a feature's tests/) when one is named. */
  read(folderId: string, name: string, subfolder?: string): Promise<{ id: string; content: string; version: number } | null>;
  /** Creates the page, or replaces its content when it exists. Markdown unless contentType says JSON. A named subfolder is made if missing. */
  write(folderId: string, name: string, content: string, contentType?: "article" | "json", subfolder?: string): Promise<HostResult<{ id: string }>>;
};

export type HostResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

/** One HTML screen as the host stores it. Hosts may add fields; Wave passes them through. */
export type WaveScreen = {
  id: string;
  name: string;
  path: string;
  content_version: number;
  [extra: string]: unknown;
};

export type WaveFlow = {
  id: string;
  name: string;
  path: string;
  is_flow: boolean;
  [extra: string]: unknown;
};

export type WaveMember = {
  id: string;
  name: string;
  path: string;
  /** A screen is HTML; a tokens member is a JSON file that may be DTCG. */
  kind: "screen" | "tokens";
  content_version: number;
  review_status: "in_review" | "approved" | null;
  /** Approved, and at the version that was approved. */
  approved_current: boolean;
  /** A tokens member's JSON. Screens leave it null; Wave reads them with readCurrent. */
  content: string | null;
};

export type WaveResources = {
  /** The screen, if it exists, is HTML and the viewer may read it. */
  screen(id: string): Promise<WaveScreen | null>;
  /** The bytes of the screen's current version. */
  readCurrent(screen: WaveScreen): Promise<string | null>;
  /**
   * Saves new bytes as the next version. baseVersion is the version the change
   * was made against; the host refuses when it is no longer current. The host
   * is expected to call recordScreenVersion after saving, as for any save.
   */
  save(screenId: string, html: string, baseVersion: number): Promise<HostResult<{ version: number }>>;
  /** The flow a screen belongs to, if it is in one. */
  flowOf(screenId: string): Promise<WaveFlow | null>;
  flow(id: string): Promise<WaveFlow | null>;
  setFlow(id: string, isFlow: boolean): Promise<HostResult>;
  /** Everything in a flow, screens and JSON files, sorted as the host lists them. */
  members(flowId: string): Promise<WaveMember[]>;
  /** Whether the viewer may change this screen or flow. */
  canEdit(id: string): Promise<boolean>;
  /** Whether the viewer is the screen's author, who marks comments addressed. */
  isAuthor(screenId: string): Promise<boolean>;
  /**
   * Creates a screen in a folder, or saves a new version of the one with that
   * name. For publishing a whole flow at once. Optional.
   */
  put?(folderId: string, name: string, html: string): Promise<HostResult<{ id: string; version: number; created: boolean }>>;
  /** Anything else the host wants the review screen to have (its review state, links). */
  extras?(screen: WaveScreen): Promise<Record<string, unknown>>;
};

export type CommentStatus = "open" | "addressed" | "resolved" | "wont_fix";

/** A comment as Wave reads it. The host owns comments; Wave only reads them. */
export type WaveComment = {
  id: string;
  parent_id: string | null;
  author_email: string | null;
  body: string;
  deleted: boolean;
  anchor: Record<string, unknown> | null;
  content_version: number | null;
  status: CommentStatus | null;
  status_note: string | null;
  [extra: string]: unknown;
};

export type WaveComments = {
  /** Every comment and reply on a screen, oldest first. */
  list(screenId: string): Promise<WaveComment[]>;
  /** The status of each top-level, live comment on these screens. */
  statuses(screenIds: string[]): Promise<{ screen_id: string; status: CommentStatus | null }[]>;
  /**
   * Moves a comment through review, for agents (mark_addressed). The host
   * enforces who may: the author says addressed, somebody else resolves.
   */
  setStatus?(commentId: string, status: CommentStatus, note: string | null, version: number | null): Promise<HostResult>;
};

export type WaveBlobs = {
  /** Keeps a copy of one version's bytes. Returns its key. */
  putSnapshot(screenId: string, version: number, html: string): Promise<string | null>;
  read(key: string): Promise<string | null>;
  remove(key: string): Promise<boolean>;
};

// Wave's own records --------------------------------------------------------------

export type ScreenVersion = {
  id: string;
  screen_id: string;
  content_version: number;
  snapshot_key: string | null;
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  extras: { css?: string[]; unidentified?: { tag: string; text: string }[] };
  created_at: string;
  updated_at: string;
};

export type VersionListing = { content_version: number; created_at: string; updated_at: string };

export type Waiver = { id: string; check_key: string; message: string; note: string; by_email: string | null; created_at: string };

export type Approval = {
  id: string;
  approved_by_email: string | null;
  approved_at: string;
  members: { screen_id: string; name: string; path: string; content_version: number; snapshot_key: string | null }[];
  tokens: { resource_id: string; name: string; content_version: number; content: string | null }[];
  waivers: { key: string; message: string; note: string; by: string | null }[];
  /** Set when somebody reopened the feature: it no longer holds it at these versions. */
  reopened_at?: string | null;
  reopened_by_email?: string | null;
};

export type NewScreenVersion = Omit<ScreenVersion, "id" | "created_at">;

export type WaveStore = {
  version(screenId: string, version: number): Promise<ScreenVersion | null>;
  /** The nodes of the newest version before this one, for carrying slugs over. */
  previousNodes(screenId: string, before: number): Promise<SpecNode[] | null>;
  versions(screenId: string): Promise<VersionListing[]>;
  /** Writes a version, replacing one with the same number. */
  saveVersion(row: NewScreenVersion): Promise<{ version: ScreenVersion | null; error: string | null }>;
  waivers(flowId: string): Promise<Waiver[]>;
  putWaiver(flowId: string, waiver: { key: string; message: string; note: string }): Promise<HostResult>;
  deleteWaiver(flowId: string, key: string): Promise<HostResult>;
  latestApproval(flowId: string): Promise<Approval | null>;
  /** Freezes the flow as approved. The database checks every rule again. */
  approve(flowId: string): Promise<HostResult>;
  /** Unlocks an approved feature; its screens follow their latest versions again until it is approved again. */
  reopen?(flowId: string): Promise<HostResult>;
  /** Screens a feature uses that live in another feature. */
  uses?(flowId: string): Promise<string[]>;
  /** Features that use a screen besides the one it lives in. */
  usedBy?(screenId: string): Promise<string[]>;
  addUse?(flowId: string, screenId: string, userId: string): Promise<HostResult>;
  removeUse?(flowId: string, screenId: string): Promise<HostResult>;
};

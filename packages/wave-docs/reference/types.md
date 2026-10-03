# Types

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

The public types of Wave's packages, as declared.

## Parsed mockup

What Wave reads out of a page. From `packages/wave-spec/src/parse.ts`.

```ts
export type Element = DefaultTreeAdapterMap["element"];

export type DomElement = Element;

export type ResourceDoc = {
  type?: string;
  source?: string;
  description?: string;
};

export type ScreenMeta = {
  spec: string | null;
  screen: string | null;
  flow: string | null;
  route: string | null;
  title: string | null;
  tokens: string | null;
  /** Who can open the screen: public, signed-in, role:x. */
  access: string | null;
  /** How people arrive: link, email, push, a screen. */
  entry: string | null;
  /** Widths designed for, space separated, e.g. "375 768 1440". */
  viewports: string | null;
  /** Page-view analytics event. */
  track: string | null;
  /** Answers the designer waived at screen level, as JSON {field: reason}. */
  waived: string | null;
  /** On a catalogue specimen page: the component it defines. */
  component: string | null;
  /** The project the screen belongs to, when it says. */
  project: string | null;
  /** The document's lang attribute. */
  lang: string | null;
  /** Whether a <meta name="viewport"> is present. */
  hasViewportMeta: boolean;
  /** From `<script type="application/wave+json" id="wave-resources">`. */
  resources: Record<string, ResourceDoc>;
  /** The document's own `<title>`. */
  documentTitle: string | null;
  /** Which prefix the file uses: wave, the legacy pi, or none yet. */
  prefix: PrefixName | null;
};

export type SpecNode = {
  id: string;
  slug: string | null;
  tag: string;
  /** Nearest identified ancestor, or null at the top. */
  parent: string | null;
  /** Identified ancestors, outermost first. */
  ancestors: string[];
  /** Collapsed text content, trimmed and capped. */
  text: string;
  /** Every data-wave-* (or legacy data-pi-*) attribute on the element, raw, keyed without its prefix. */
  attrs: Record<string, string>;
  /** Other attributes worth knowing: type, href, role, aria-*, required, min, max and so on. */
  html: Record<string, string>;
  /** Class names, in order. */
  classes: string[];
  /** The text of the label that names this control, however it is associated. */
  label: string | null;
  /** Hidden in the markup: the hidden attribute, display:none or an is-hidden class. */
  hidden: boolean;
  /** For a select or list box: its options' text. */
  options: string[];
  /** Icon names hinted at by classes or an SVG sprite reference. */
  iconHints: string[];
  /** The largest group of element children sharing one tag and class list. */
  repeatedChildren: number;
  /** Number of element children. */
  childCount: number;
  formControl: boolean;
  interactive: boolean;
  /** Document order among nodes. */
  order: number;
};

/** A file the page loads: an image, a font, an icon. */
export type AssetRef = {
  kind: "img" | "srcset" | "css-url" | "font" | "icon" | "poster" | "source" | "use";
  url: string;
  /** The node it belongs to, when it is on one. */
  pid?: string;
};

/** What the page runs and loads, for the portability checks. */
export type PageFacts = {
  scripts: { src: string | null; length: number; usesStorage: boolean; buildsDom: boolean; usesXhr: boolean }[];
  stylesheets: string[];
  iframes: number;
  /** Elements inside <body>, excluding scripts. */
  bodyElements: number;
};

export type Severity = "error" | "warn" | "info";

export type Finding = {
  code: string;
  severity: Severity;
  message: string;
  /** The node it is about, when it is about one. */
  pid?: string;
};

export type ParsedMockup = {
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  /** Interactive or form elements carrying no id, for the completeness checks. */
  unidentifiedInteractive: { tag: string; text: string }[];
  /** Declarations with literal values, for the off-token check. */
  css: string[];
  assets: AssetRef[];
  facts: PageFacts;
};
```

## Preflight

The last check before a screen is saved. From `packages/wave-spec/src/preflight.ts`.

```ts
/**
 * The last check before a screen is uploaded: will it look and work the same
 * in Wave as it did in Claude Design, and is everything Wave needs in it?
 */

export type PreflightIssue = { code: string; level: "mandatory" | "recommended"; message: string };

export type PreflightReport = {
  pass: boolean;
  screen: string;
  issues: PreflightIssue[];
  counts: { mandatoryOpen: number; recommendedOpen: number; proposed: number; waived: number };
  /** The open mandatory requirements, for the designer to see. */
  open: Requirement[];
};
```

## Requirements

The questions engine: each field, its status and where its answer came from. From `packages/wave-spec/src/requirements.ts`.

```ts
/**
 * What every element must say, and whether it says it.
 *
 * One table drives everything: the Claude Design interview, the dry run's
 * question sheet, the red and amber marks in the inspector, preflight and the
 * flow's approval. A field is answered by an attribute in the HTML (the HTML is
 * the spec), by a native attribute that already says it (alt, type, min), or,
 * for checks, by something existing (a label, an error state drawn). Anything
 * Wave can work out on its own is offered as a proposal the designer confirms.
 */

export type Level = "mandatory" | "recommended";

export type Owner = "design" | "product";

export type Tab = "identity" | "styles" | "content" | "behavior" | "inputs" | "states";

/** Where an answer is written. */
export type Write =
  | { kind: "attr"; key: string }
  | { kind: "native"; name: string }
  | { kind: "meta"; key: string }
  | { kind: "resource"; path: string }
  /** Satisfied by the design itself (a label, a drawn state). Only waivable. */
  | { kind: "check" };

export type Inference = { value: string; tier: "set" | "proposed"; reason: string };

export type Status = "answered" | "waived" | "proposed" | "missing";

/**
 * Where an answer came from: the element's own HTML, the project's DESIGN.md,
 * its design-system component, the feature's FEATURE.md, or Wave working it
 * out for certain (a name, a type, a submit button's trigger).
 */
export type Source = "html" | "design" | "component" | "feature" | "auto";

export type Requirement = {
  /** Stable question id: screen/pid/field, screen/screen/field or screen/resource/path. */
  qid: string;
  screen: string;
  pid: string | null;
  address: string | null;
  type: ElementType | "screen";
  field: string;
  label: string;
  question: string;
  tab: Tab;
  owner: Owner;
  level: Level;
  status: Status;
  value: string | null;
  proposal: Inference | null;
  waivedReason: string | null;
  write: Write;
  /** Allowed answers, when the field has a fixed set. */
  choices?: string[];
  /** Where the answer came from, when answered. */
  source?: Source;
};

export type ElementInfo = {
  pid: string;
  type: ElementType;
  certain: boolean;
  reason: string;
  slug: string | null;
  address: string;
  parent: string | null;
  parentAddress: string | null;
  component: string | null;
  variant: string | null;
  behaviours: string[];
};

// Evaluation ------------------------------------------------------------------------------

export type ScreenRequirements = {
  screen: string;
  elements: ElementInfo[];
  requirements: Requirement[];
  counts: { mandatoryOpen: number; recommendedOpen: number; waived: number; answered: number; proposed: number };
};

export type EvaluateOptions = {
  /** The screen's HTML, needed to compare component instances with the catalogue. */
  html?: string;
  /** The project's tokens. Undefined skips the token checks; null means the project has none. */
  tokens?: TokenSet | null;
  /** Where the project's assets are served. Undefined skips the asset checks. */
  assetBase?: string | null;
  /** The project's catalogue. Undefined skips the catalogue checks; null means there is none yet. */
  catalogue?: Catalogue | null;
  /** The project's DESIGN.md defaults, inherited by every element. */
  design?: DesignDefaults | null;
  /** The feature's FEATURE.md: its screens, fields, data and actions. */
  feature?: FeatureBrief | null;
};
```

## Question sheet

The dry run and the answer sheet. From `packages/wave-spec/src/sheet.ts`.

```ts
/**
 * The question sheet and the answer sheet.
 *
 * A dry run lists every open question for a feature's screens as a Markdown
 * page anyone can fill in (the designer shares it with product). Each question
 * carries its stable id, so an answer stays attached to the right element
 * across runs. When every mandatory question has a valid answer or a waiver,
 * the dry run writes the answer sheet, which the full run applies to the HTML.
 */

export type SheetAnswer = { qid: string; answer: string | null };

export type Checked = { ok: true; value: string } | { ok: false; error: string };

export type DryRunItem = Requirement & { answer: string | null; raw: string | null; answerError: string | null; open: boolean };

export type ScreenSheetInput = { slug: string; label: string; requirements: Requirement[]; nodes: { id: string; slug: string | null }[] };

export type DryRunResult = {
  pass: boolean;
  items: DryRunItem[];
  counts: { mandatoryOpen: number; recommendedOpen: number; answeredInSheet: number; invalid: number; waived: number };
};

export type QuestionGroup = { key: string; items: DryRunItem[] };

export type ApplyResult = { html: string; applied: string[]; skipped: { qid: string; reason: string }[] };
```

## Briefs

DESIGN.md and FEATURE.md, parsed. From `packages/wave-spec/src/briefs.ts`.

```ts
/**
 * The two briefs that answer most of Wave's questions before a screen is drawn.
 *
 * DESIGN.md sits at the project root. Its front matter holds the project's
 * defaults (how copy is managed, who can see things, analytics, forms, icons,
 * responsive behaviour); its prose is the design language Claude Design
 * follows. Every element inherits these defaults unless it says otherwise.
 *
 * FEATURE.md sits in each feature folder. Its front matter lists the feature's
 * screens, the fields people fill in, the data the screens show and the
 * actions they take; its prose is the brief. Elements that write a field, show
 * data or take an action inherit what the brief says about it.
 *
 * Both are Markdown with a YAML front matter block between --- lines, so a
 * person reads them as documents and Wave reads the block.
 */

export type BriefProblem = { path: string; message: string };

// DESIGN.md --------------------------------------------------------------------------------

export type DesignDefaults = {
  name: string | null;
  lang: string | null;
  /** Widths every screen is designed for, space separated, e.g. "390 1280". */
  viewports: string | null;
  /** Who can open a screen unless its feature says otherwise: public, signed-in, role:<name>. */
  access: string | null;
  /** Who can see an element unless it says otherwise, e.g. everyone. */
  elementAccess: string;
  /** The icon set: a library name (lucide, material) or inline for drawn SVGs. */
  icons: string | null;
  /** Default copy status of fixed text: final, draft or placeholder. */
  copy: "final" | "draft" | "placeholder" | null;
  /** Where fixed copy lives: code, cms or i18n. */
  copySource: string | null;
  /** Default analytics for controls: none, or a naming convention such as object_action. */
  track: string | null;
  /** The page-view event convention, or none. */
  pageViews: string | null;
  /** Feature flags unless an element says otherwise: none. */
  flags: string | null;
  /** What sections and cards do on small screens by default: stack, hide, collapse, scroll. */
  responsive: string | null;
  validateOn: "submit" | "blur" | "change" | null;
  dirtyGuard: "on" | "off" | null;
  /** What data-driven text shows when there is no value: hide, a dash, or text. */
  empty: string | null;
  overflow: string | null;
  fit: string | null;
  externalTarget: "_blank" | "_self" | null;
  modalDismiss: string | null;
  toastDismiss: string | null;
};

export type DesignBrief = { design: DesignDefaults; prose: string; sections: string[]; problems: BriefProblem[] };

// FEATURE.md -------------------------------------------------------------------------------

export type FeatureScreen = { slug: string; title: string | null; route: string | null; access: string | null; entry: string | null; track: string | null };

export type FeatureField = {
  path: string;
  label: string | null;
  type: string | null;
  validate: string | null;
  options: string | null;
  default: string | null;
  visibleIf: string | null;
  format: string | null;
  description: string | null;
};

export type FeatureData = {
  path: string;
  type: string | null;
  source: string | null;
  description: string | null;
  empty: string | null;
  format: string | null;
  max: string | null;
  sort: string | null;
  paginate: string | null;
};

export type FeatureAction = {
  id: string;
  screen: string | null;
  /** Slugs (or ids) of the elements that take this action, when they do not carry data-wave-action. */
  on: string[];
  trigger: string | null;
  effect: string | null;
  to: string | null;
  failure: string | null;
  confirm: string | null;
  feedback: string | null;
  track: string | null;
  disabledIf: string | null;
};

export type FeatureBrief = {
  feature: string | null;
  name: string | null;
  screens: FeatureScreen[];
  fields: Map<string, FeatureField>;
  data: Map<string, FeatureData>;
  actions: FeatureAction[];
};

export type FeatureBriefResult = { feature: FeatureBrief; prose: string; problems: BriefProblem[] };
```

## Catalogue

Components, specimens and how an instance matches its component. From `packages/wave-spec/src/catalogue.ts`.

```ts
/**
 * The project's design system catalogue.
 *
 * Each component is one HTML specimen page in <project>/design-system/components.
 * Its head says what it is (wave:component, a JSON definition), and its body
 * draws every variant and state, each example marked with
 * data-wave-component and data-wave-variant (and data-wave-state for states).
 * Being HTML, a specimen is reviewed, commented on and approved in Wave like
 * any screen.
 *
 * An instance on a screen matches its component when its markup has the same
 * shape (tags and classes, ignoring text and data) and its CSS rules for those
 * classes are the same. Anything else is drift, which the designer either
 * fixes or confirms as a new component or variant.
 */

export type ComponentStatus = "proposed" | "approved" | "deprecated";

export type ComponentDefinition = {
  name: string;
  /** The element type from the rules table, e.g. button, textInput. */
  type: string | null;
  description: string | null;
  variants: string[];
  states: string[];
  anatomy: string[];
  a11y: string | null;
  status: ComponentStatus;
  /** What it does on small screens, inherited by every instance. */
  responsive?: string | null;
  /** What using it means, e.g. {"select": "change"}: the trigger its instances inherit. */
  events?: Record<string, string>;
  /** The design-system id, e.g. DS.button: how people and code name the component. */
  id?: string | null;
  /** One id per variant, e.g. {"primary": "DS.primaryButton"}. */
  variantIds?: Record<string, string>;
  /** Where the specimen was drawn, from <meta name="figma-source">: figma:<file key>/<node id>. */
  source?: string | null;
};

export type ComponentExample = {
  pid: string;
  variant: string;
  state: string | null;
  signature: string;
  styles: string[];
};

export type CatalogueComponent = ComponentDefinition & {
  pageId: string;
  pagePath: string;
  version: number;
  examples: ComponentExample[];
  problems: string[];
};

export type Catalogue = { components: CatalogueComponent[] };

export type InstanceMatch = {
  status: "match" | "new-component" | "new-variant" | "drift" | "unapproved";
  component: string;
  variant: string;
  details: string[];
};

/** One drawn variant of a component, for the prototype to swap an instance's look when its state changes. */
export type SpecimenVariant = { component: string; variant: string; state: string; html: string };
```

## Tokens

A project's DTCG tokens. From `packages/wave-spec/src/tokens.ts`.

```ts
/**
 * Design tokens in the W3C DTCG format, flattened for lookup.
 *
 * A flow keeps one JSON page of tokens. Two questions are asked of it: what
 * token does this CSS variable name (`--color-blue-500` is `color.blue.500`),
 * and what token has this value (for a style written as a literal). Values are
 * normalised first so `#fff`, `#FFFFFF` and `rgb(255, 255, 255)` are one colour,
 * and `1rem` and `16px` are one size.
 */

export type Token = {
  /** Dotted path, e.g. color.blue.500 */
  path: string;
  type: string | null;
  /** The resolved value, as CSS text. */
  value: string;
  /** Where it pointed, when the value was an alias. */
  alias: string | null;
  description: string | null;
  /** The custom property it is expected to be published as. */
  cssVar: string;
  /** Comparable form of the value, or null when it has none. */
  normalised: string | null;
};

export type TokenSet = {
  tokens: Token[];
  byPath: Map<string, Token>;
  byVar: Map<string, Token>;
  byValue: Map<string, Token[]>;
  problems: string[];
};
```

## Flow

A feature's screens as one graph: destinations, data dictionary, actions, checks. From `packages/wave-spec/src/flow.ts`.

```ts
/**
 * Views over a whole flow, derived from its screens' node indexes.
 *
 * Nothing here is stored. The data dictionary, the action catalog, the graph and
 * the completeness checks are all read out of the HTML's attributes each time,
 * so they can never say something the mockups do not.
 */

export type FlowScreen = {
  pageId: string;
  name: string;
  path: string;
  meta: ScreenMeta;
  nodes: SpecNode[];
  /** Null when the flow has no token page to compare against. */
  offToken: OffToken[] | null;
  unidentifiedInteractive?: { tag: string; text: string }[];
};

export type Resolved =
  | { ok: true; screen: FlowScreen; node: SpecNode | null }
  | { ok: false; reason: string }
  | { ok: true; external: true };

export type Usage = {
  pageId: string;
  screen: string;
  pid: string;
  slug: string | null;
  kind: "bind" | "repeat" | "field" | "condition";
};

export type DictionaryEntry = {
  path: string;
  type: string | null;
  source: string | null;
  description: string | null;
  usages: Usage[];
};

export type ActionEntry = {
  name: string;
  triggers: string[];
  effects: string[];
  to: string[];
  toFailure: string[];
  sources: { pageId: string; screen: string; pid: string; slug: string | null; text: string }[];
};

export type Edge = { from: string; to: string; label: string; failure: boolean };

export type FlowGraph = {
  mermaid: string;
  edges: Edge[];
  /** Screens with no way out. */
  deadEnds: string[];
  /** Screens nothing leads to, other than the first. */
  unreachable: string[];
};

export type Check = {
  /** Stable across revisions, so a waiver keeps applying. */
  key: string;
  code:
    | "no-action"
    | "unbound-dynamic"
    | "input-no-field"
    | "unresolved-destination"
    | "no-states"
    | "off-token"
    | "unidentified-control";
  pageId: string;
  screen: string;
  pid?: string;
  message: string;
};

export type ComponentStates = {
  component: string;
  states: string[];
  nodes: { pageId: string; screen: string; pid: string; slug: string | null; depicted: string[] }[];
};
```

## Destinations

Where an action leads. From `packages/wave-spec/src/destination.ts`.

```ts
/**
 * Where an action leads.
 *
 *   screen:<screen-slug>
 *   node:<screen-slug>/<node-slug>      (or node:<screen>/<parent>/<node>, or node:<node> on the same screen)
 *   modal:<screen-slug>/<node-slug>     (a node shown over the current screen)
 *   back
 *   url:<https://...>
 */
export type Destination =
  | { kind: "screen"; screen: string }
  | { kind: "node"; screen: string | null; node: string; path: string[] }
  | { kind: "modal"; screen: string | null; node: string; path: string[] }
  | { kind: "back" }
  | { kind: "url"; url: string }
  | { kind: "invalid"; raw: string };
```

## Comment anchors

Where a review comment points. From `packages/wave-spec/src/anchor.ts`.

```ts
/**
 * Where on a screen a comment points. Null for a comment about the screen as a
 * whole. Stored by the host with its comment; Wave reads and writes the shape.
 */
export type CommentAnchor =
  | { kind: "node"; pid: string; slug?: string | null; text?: string }
  | { kind: "range"; pid: string; start: number; end: number; quote: string; slug?: string | null }
  | { kind: "region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered?: string[] }
  | { kind: "element"; selector: string; fingerprint: { tag: string; classes: string; text: string; ancestor: string | null } };

export type CommentStatus = "open" | "addressed" | "resolved" | "wont_fix";
```

## Assets

Images, fonts and files a page uses. From `packages/wave-spec/src/assets.ts`.

```ts
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
```

## Handover

What Claude Code builds from once a feature is approved. From `packages/wave-spec/src/handover.ts`.

```ts
/**
 * The package Claude Code receives for an approved flow.
 *
 * Built only from the frozen revisions an approval recorded, so asking for it
 * again tomorrow gives the same answer even if somebody has edited a screen
 * since. The HTML files are the spec; the Markdown is a reading guide to them.
 */

export type HandoverScreen = {
  pageId: string;
  name: string;
  version: number;
  html: string;
};

export type HandoverDecision = {
  status: "resolved" | "wont_fix";
  screen: string;
  anchor: string;
  body: string;
  note: string | null;
  author: string | null;
};

export type HandoverWaiver = { key: string; message: string; note: string; by: string | null };

export type HandoverInput = {
  flowName: string;
  flowPath: string;
  approvedBy: string | null;
  approvedAt: string;
  screens: HandoverScreen[];
  tokens: { name: string; version: number; json: string } | null;
  decisions: HandoverDecision[];
  waivers: HandoverWaiver[];
};

export type Handover = {
  markdown: string;
  json: Record<string, unknown>;
  files: ZipEntry[];
};
```

## Host contract

What a product implements to host Wave. From `packages/wave-server/src/host.ts`.

```ts
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
  read(folderId: string, name: string): Promise<{ id: string; content: string; version: number } | null>;
  /** Creates the page, or replaces its content when it exists. Markdown unless contentType says JSON. */
  write(folderId: string, name: string, content: string, contentType?: "article" | "json"): Promise<HostResult<{ id: string }>>;
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
```

## Inspector protocol

Messages between a mockup frame and the review panel. From `packages/wave-inspector/src/protocol.ts`.

```ts
/**
 * Talking to the inspector inside the framed mockup.
 *
 * The frame is an opaque origin, so its messages arrive from "null" and cannot
 * be told apart from anything the mockup's own scripts send. Every message is
 * therefore treated as untrusted input: checked for shape, never rendered as
 * markup, and only ever able to do what a click in the page could do anyway
 * (select something, show something, open another screen of the same flow).
 */

export type Box = { margin: number[]; border: number[]; padding: number[]; content: number[] };

export type StyleEntry = {
  prop: string;
  value: string;
  written: string | null;
  vars: string[];
  isDefault: boolean;
};

export type Styles = {
  groups: Record<string, StyleEntry[]>;
  box: Box;
  unreadableSheets: number;
  rootVars: Record<string, string>;
};

export type ElementRef = {
  selector: string;
  fingerprint: { tag: string; classes: string; text: string; ancestor: string | null };
};

export type FrameMessage =
  | { type: "wave:hello" }
  | { type: "wave:hover"; id: string | null; label: string | null }
  | { type: "wave:select"; id: string | null; element?: ElementRef; ancestors?: string[]; fromUser?: boolean }
  | { type: "wave:range"; pid: string; start: number; end: number; quote: string; ancestors?: string[] }
  | { type: "wave:region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered: string[] }
  | { type: "wave:styles"; id: string | null; styles: Styles }
  | { type: "wave:pin-click"; commentId: string }
  | { type: "wave:unresolved"; commentIds: string[] }
  | { type: "wave:navigate"; to: string; from: string | null }
  | { type: "wave:key"; key: string }
  | { type: "wave:scroll"; x: number; y: number }
  | { type: "wave:state-previewed"; id: string | null; state: string | null };
```

## Prototype protocol

Messages between a prototype frame and its viewer. From `packages/wave-prototype/src/protocol.ts`.

```ts
/**
 * Messages between the prototype viewer and the screen it frames.
 *
 * The frame runs somebody's markup in an opaque origin, so everything it sends
 * is untrusted: readFrameMessage checks every field before the viewer acts on
 * it. The viewer only listens to its own frame's window.
 */

/** What the prototype remembers across screens: the data it has loaded or collected, and route parameters. */
export type PrototypeState = {
  data: Record<string, unknown>;
  params: Record<string, string>;
};

/** Viewer to frame. */
export type InitMessage = {
  type: "wave-proto:init";
  screen: string;
  api: PrototypeApi | null;
  state: PrototypeState;
  /** Which response each operation gives, by operation id and response name. Default: the first success. */
  choices: Record<string, string>;
  /** Multiplies every operation's delay: 0 instant, 1 as written, 3 slow network. */
  speed: number;
  /** A node to show on arrival (a node:screen/slug destination on another screen). */
  reveal: string | null;
  /**
   * Without an API (the Figma flow), what an action that would call the backend does:
   * succeed (follow data-wave-to) or fail (follow data-wave-to-failure). Default: succeed.
   */
  outcome?: Outcome;
  /** The design system's component variants, so a chip or a card shows its selected look when chosen. */
  variants?: ComponentVariant[];
  /** The CSS those variants need (their utility classes and token variables). */
  variantCss?: string;
};

export type Outcome = "success" | "failure";

/** One variant of a catalogue component, rendered: its root element's markup and the CSS it needs. */
export type ComponentVariant = { component: string; variant: string; state: string; html: string };

/** Viewer to frame: new scenario choices or network speed, without reloading the screen. */
export type SettingsMessage = { type: "wave-proto:settings"; choices: Record<string, string>; speed: number; outcome?: Outcome };

export type Navigate = { kind: "screen"; screen: string; reveal: string | null } | { kind: "back" };

/** Frame to viewer. */
export type FrameMessage =
  | { type: "wave-proto:ready" }
  | { type: "wave-proto:navigate"; to: Navigate; state: PrototypeState }
  | { type: "wave-proto:state"; state: PrototypeState }
  | { type: "wave-proto:request"; method: string; url: string; operation: string | null; status: number; ms: number }
  | { type: "wave-proto:notice"; message: string };
```

## Figma conversion

The entry gate's report. From `packages/wave-figma/src/gate.ts`.

```ts
/**
 * The entry gate: what in a Figma file keeps it from becoming Wave screens as
 * it is. Wave does not bend to a file; the file is fixed in Figma and the gate
 * run again. Nothing is converted until the gate passes.
 *
 * The rules are one plain function, `inspectNodes`, that the GATE plugin script
 * carries as source (see scripts.ts), so what runs in Figma is what is tested
 * here. It must stay self-contained: no imports, no outer names, no TypeScript
 * that survives compilation.
 */

/** What the plugin script gathers before the rules run (the parts that need Figma's async API). */
export type GateFacts = {
  /** Local variables by id. */
  vars: Record<string, { name: string; type: string; scopes: string[]; collection: string; values: Record<string, unknown> }>;
  /** Default mode by collection id. */
  defaultModes: Record<string, string>;
  textStyles: number;
  /** Each instance's main component, by instance id: its size, and whether it hugs its content on each axis. */
  mains: Record<string, { name: string; remote: boolean; page: string | null; width?: number; height?: number; hugW?: boolean; hugH?: boolean; bools?: Record<string, boolean> }>;
  /** Names of the file's local components and component sets. */
  componentNames: string[];
  /** The design-system page, when the file has one. */
  dsPage: string | null;
};

/** A finding: the rule, the layer, what is wrong, and the screen or component it is in. */
export type GateHit = { rule: string; node: string; name: string; detail?: string; in?: string };

/** What the rules found, the font families the checked text uses, and the frames and components they checked. */
export type GateInspection = { hits: GateHit[]; fonts: string[]; covers: string[] };

/* eslint-enable @typescript-eslint/no-explicit-any */

export type GateSeverity = "blocking" | "advice";

export type GateReport = {
  file: string | null;
  pages: string[];
  covers: string[];
  fonts: string[];
  total: number;
  hits: Record<string, { count: number; nodes: [string, string, string?, string?][] }>;
};

export type GateResult = { pass: boolean; blocking: number; advice: number; rules: { rule: string; severity: GateSeverity; title: string; fix: string; count: number; nodes: [string, string, string?, string?][] }[] };
```

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ATTRIBUTES,
  TRIGGERS,
  followsPathGrammar,
  parseDestination,
  formatDestination,
  type Destination,
} from "@postit/mockup-spec/client";
import { normaliseValue } from "@postit/mockup-spec/tokens";
import type { SpecNode } from "@postit/mockup-spec";
import type { MockupView } from "@/lib/mockup-view";
import {
  STATUS_LABELS,
  describeAnchor,
  type Comment,
  type CommentAnchor,
} from "@/lib/comment-threads";
import type { ElementRef, Styles, StyleEntry } from "./bridge";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "element"; element: ElementRef; ancestors: string[] }
  | { kind: "range"; pid: string; start: number; end: number; quote: string }
  | { kind: "region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered: string[] }
  | null;

type Tab = "identity" | "styles" | "content" | "behavior" | "inputs" | "states" | "comments";

type Anchored = Comment & { n: number };

type Result = { ok: boolean; error?: string; id?: string };

type Props = {
  view: MockupView;
  sel: Selection;
  node: SpecNode | undefined;
  nodesById: Map<string, SpecNode>;
  styles: { id: string | null; styles: Styles } | null;
  editable: boolean;
  anchored: Anchored[];
  orphaned: Set<string>;
  activeComment: string | null;
  previewed: { id: string; state: string } | null;
  onActivateComment: (id: string | null) => void;
  onSelectNode: (id: string) => void;
  onEdit: (body: Record<string, unknown>) => Promise<Result>;
  onComment: (body: string, anchor: CommentAnchor | null, parentId?: string | null) => Promise<Result>;
  onStatus: (id: string, status: string, note: string | null) => Promise<Result>;
  onReattach: (id: string, anchor: CommentAnchor) => Promise<Result>;
  onRemoveComment: (id: string) => Promise<void>;
  onPreviewState: (id: string, state: string | null) => void;
  onBoxLayer: (layer: string | null) => void;
  onNavigate: (to: string) => void;
  onClearSelection: () => void;
  selectElement: (element: ElementRef) => void;
};

export function Panel(props: Props) {
  const { sel, node, view } = props;
  const [tab, setTab] = useState<Tab>("comments");

  const tabs: { key: Tab; label: string }[] = useMemo(() => {
    if (!sel) return [{ key: "comments", label: "Comments" }];
    if (sel.kind === "region") return [{ key: "comments", label: "Comments" }];
    if (sel.kind === "element") {
      return [
        { key: "identity", label: "Identity" },
        { key: "styles", label: "Styles" },
        { key: "comments", label: "Comments" },
      ];
    }
    if (sel.kind === "range") {
      return [
        { key: "content", label: "Content" },
        { key: "comments", label: "Comments" },
      ];
    }
    const t: { key: Tab; label: string }[] = [
      { key: "identity", label: "Identity" },
      { key: "styles", label: "Styles" },
      { key: "content", label: "Content" },
      { key: "behavior", label: "Behavior" },
    ];
    if (node?.formControl) t.push({ key: "inputs", label: "Inputs" });
    t.push({ key: "states", label: "States" }, { key: "comments", label: "Comments" });
    return t;
  }, [sel, node?.formControl]);

  // Keep the tab when it still applies; otherwise take the most useful one.
  useEffect(() => {
    if (tabs.some((t) => t.key === tab)) return;
    setTab(sel?.kind === "range" ? "content" : tabs[0].key);
  }, [tabs, tab, sel]);

  useEffect(() => {
    if (props.activeComment) setTab("comments");
  }, [props.activeComment]);

  const title = !sel
    ? view.screen.title || view.node.name
    : sel.kind === "node"
      ? node?.slug ?? sel.id
      : sel.kind === "element"
        ? `Unidentified <${sel.element.fingerprint.tag}>`
        : sel.kind === "range"
          ? `"${sel.quote.slice(0, 40)}${sel.quote.length > 40 ? "…" : ""}"`
          : "An area";

  return (
    <aside className="rv-panel" aria-label="Inspector">
      <div className="rv-panel-head">
        <div className="rv-panel-title">
          <strong>{title}</strong>
          {sel ? (
            <button type="button" className="rv-linkbtn" onClick={props.onClearSelection}>
              Clear
            </button>
          ) : null}
        </div>
        {sel && (sel.kind === "node" || sel.kind === "range") ? (
          <Breadcrumb
            id={sel.kind === "node" ? sel.id : sel.pid}
            nodesById={props.nodesById}
            onSelect={props.onSelectNode}
          />
        ) : null}
        <nav className="rv-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`rv-tab ${tab === t.key ? "is-on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "comments" ? <CommentCount {...props} /> : null}
            </button>
          ))}
        </nav>
      </div>
      <div className="rv-panel-body">
        {!props.editable && sel && tab !== "comments" && tab !== "styles" ? (
          <p className="rv-note">
            {view.current
              ? "You can read this, but not change it."
              : "This is an older version. Switch to the current one to change anything."}
          </p>
        ) : null}
        {tab === "identity" ? <IdentityTab {...props} /> : null}
        {tab === "styles" ? <StylesTab {...props} /> : null}
        {tab === "content" ? <ContentTab {...props} /> : null}
        {tab === "behavior" ? <BehaviorTab {...props} /> : null}
        {tab === "inputs" ? <InputsTab {...props} /> : null}
        {tab === "states" ? <StatesTab {...props} /> : null}
        {tab === "comments" ? <CommentsTab {...props} /> : null}
      </div>
    </aside>
  );
}

function CommentCount({ anchored, sel }: Props) {
  const pid = sel?.kind === "node" ? sel.id : sel?.kind === "range" ? sel.pid : null;
  const open = anchored.filter(
    (c) => c.status !== "resolved" && c.status !== "wont_fix" && (!pid || anchorPid(c.anchor) === pid),
  ).length;
  return open ? <span className="rv-count">{open}</span> : null;
}

function anchorPid(a: CommentAnchor | null | undefined): string | null {
  if (!a) return null;
  if (a.kind === "node" || a.kind === "range") return a.pid;
  return null;
}

function Breadcrumb({ id, nodesById, onSelect }: { id: string; nodesById: Map<string, SpecNode>; onSelect: (id: string) => void }) {
  const node = nodesById.get(id);
  if (!node) return null;
  const chain = [...node.ancestors, node.id];
  return (
    <nav className="rv-crumbs" aria-label="Ancestors">
      {chain.map((a, i) => {
        const n = nodesById.get(a);
        return (
          <span key={a}>
            {i > 0 ? <span className="rv-crumb-sep">›</span> : null}
            <button type="button" className={`rv-crumb ${a === id ? "is-on" : ""}`} onClick={() => onSelect(a)}>
              {n?.slug ?? `<${n?.tag ?? "?"}>`}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

// ---- small form pieces --------------------------------------------------------

const DESCRIPTIONS = new Map(ATTRIBUTES.map((a) => [a.key, a]));

function Field({ name, label, children, hint }: { name: string; label?: string; children: ReactNode; hint?: ReactNode }) {
  const spec = DESCRIPTIONS.get(name);
  return (
    <label className="rv-field">
      <span className="rv-field-label" title={spec?.description}>
        {label ?? name} <code>{spec?.attr ?? `data-pi-${name}`}</code>
      </span>
      {children}
      {hint ? <span className="rv-field-hint">{hint}</span> : null}
    </label>
  );
}

function Suggest({ id, options }: { id: string; options: { name: string; count: number }[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o.name} value={o.name}>
          {o.count > 1 ? `used ${o.count} times` : ""}
        </option>
      ))}
    </datalist>
  );
}

function GrammarHint({ value }: { value: string }) {
  if (!value.trim() || followsPathGrammar(value)) return null;
  return <span className="rv-warn">Names read best as a path, like user/firstName. This one is kept as typed.</span>;
}

/**
 * A draft of some of a node's attributes, saved together.
 *
 * Empty means remove, except for the flags, which are written bare when on.
 */
function useDraft(node: SpecNode | undefined, keys: string[], version: number, flags: string[] = []) {
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      out[k] = flags.includes(k) ? (node?.attrs[k] !== undefined ? "on" : "") : (node?.attrs[k] ?? "");
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, version, keys.join(",")]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const dirty = keys.some((k) => (draft[k] ?? "") !== (initial[k] ?? ""));
  const changes = () => {
    const set: Record<string, string | null> = {};
    for (const k of keys) {
      if ((draft[k] ?? "") === (initial[k] ?? "")) continue;
      if (flags.includes(k)) set[k] = draft[k] ? "" : null;
      else set[k] = draft[k].trim() ? draft[k].trim() : null;
    }
    return set;
  };
  const field = (k: string) => ({
    value: draft[k] ?? "",
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value })),
  });
  return { draft, setDraft, dirty, changes, field, reset: () => setDraft(initial) };
}

function SaveBar({
  dirty,
  editable,
  onSave,
  onReset,
}: {
  dirty: boolean;
  editable: boolean;
  onSave: () => Promise<Result>;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!editable) return null;
  return (
    <div className="rv-savebar">
      {error ? <p className="rv-error">{error}</p> : null}
      {saved && !dirty ? <p className="rv-ok">Saved as a new version.</p> : null}
      <button
        type="button"
        className="btn btn-small"
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await onSave();
          setBusy(false);
          if (!r.ok) setError(r.error ?? "Could not save.");
          else setSaved(true);
        }}
      >
        {busy ? "Saving…" : "Save to the HTML"}
      </button>
      {dirty ? (
        <button type="button" className="btn btn-secondary btn-small" onClick={onReset} disabled={busy}>
          Discard
        </button>
      ) : null}
    </div>
  );
}

function Readonly({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rv-row">
      <span className="rv-row-label">{label}</span>
      <span className="rv-row-value">{value}</span>
    </div>
  );
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function addressOf(view: MockupView, node: SpecNode, nodesById: Map<string, SpecNode>) {
  const screen = view.screen.screen ?? view.node.name;
  const chain = node.ancestors.map((a) => nodesById.get(a)?.slug).filter((s): s is string => !!s);
  const short = `${screen}/${node.slug ?? node.id}`;
  const long = [screen, ...chain, node.slug ?? node.id].join("/");
  return { short, long };
}

// ---- Identity -----------------------------------------------------------------

function IdentityTab(props: Props) {
  const { sel, node, view, nodesById, editable, onEdit, onComment } = props;
  const keys = useMemo(() => ["slug", "component", "variant", "role"], []);
  const d = useDraft(node, keys, view.version);
  const [asked, setAsked] = useState(false);

  if (sel?.kind === "element") {
    return (
      <div className="rv-section">
        <p>
          This <code>&lt;{sel.element.fingerprint.tag}&gt;</code> has no <code>data-pi-id</code>. It can be commented on,
          but nothing can be specified on it until the designer gives it an id: the id is theirs to choose, so it survives
          their next edit.
        </p>
        <Readonly label="Text" value={sel.element.fingerprint.text || "none"} />
        <Readonly label="Inside" value={sel.element.fingerprint.ancestor ? nodesById.get(sel.element.fingerprint.ancestor)?.slug ?? sel.element.fingerprint.ancestor : "the page"} />
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={asked}
          onClick={async () => {
            const r = await onComment(
              `Please give this <${sel.element.fingerprint.tag}>${sel.element.fingerprint.text ? ` ("${sel.element.fingerprint.text.slice(0, 60)}")` : ""} a data-pi-id and a slug, so it can be specified and commented on reliably.`,
              { kind: "element", selector: sel.element.selector, fingerprint: sel.element.fingerprint },
            );
            if (r.ok) setAsked(true);
          }}
        >
          {asked ? "Asked" : "Ask the designer to identify it"}
        </button>
      </div>
    );
  }

  if (!node) return <p className="rv-empty">This node is not in this version.</p>;
  const address = addressOf(view, node, nodesById);

  return (
    <div className="rv-section">
      <Readonly label="Id" value={<code>{node.id}</code>} />
      <Readonly
        label="Address"
        value={
          <>
            <code>{address.short}</code>{" "}
            <button type="button" className="rv-linkbtn" onClick={() => copy(address.short)}>
              Copy
            </button>
            {address.long !== address.short ? (
              <span className="rv-muted rv-block">
                Full path <code>{address.long}</code>
              </span>
            ) : null}
          </>
        }
      />
      <Readonly label="Element" value={<code>&lt;{node.tag}&gt;</code>} />
      {node.attrs.origin === "postit" ? (
        <p className="rv-note">This id was made in Post-it for a word-level binding. Claude Design adopts it on its next edit.</p>
      ) : null}
      <Field name="slug" label="Slug">
        <input className="rv-input" {...d.field("slug")} disabled={!editable} placeholder="add-address-button" />
      </Field>
      <Field name="component" label="Component">
        <input className="rv-input" list="pi-components" {...d.field("component")} disabled={!editable} placeholder="Button" />
      </Field>
      <Suggest id="pi-components" options={view.vocabulary.components} />
      <Field name="variant" label="Variant">
        <input className="rv-input" {...d.field("variant")} disabled={!editable} placeholder="primary" />
      </Field>
      <Field name="role" label="Role">
        <input className="rv-input" {...d.field("role")} disabled={!editable} placeholder="input, form, dialog" />
      </Field>
      <SaveBar dirty={d.dirty} editable={editable} onReset={d.reset} onSave={() => onEdit({ op: "set", pid: node.id, set: d.changes() })} />
    </div>
  );
}

// ---- Styles -------------------------------------------------------------------

const TOKENISED = new Set([
  "color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "font-size", "line-height", "letter-spacing", "font-family", "font-weight",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "row-gap", "column-gap", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "box-shadow",
]);

function StylesTab({ styles, view, sel, onBoxLayer }: Props) {
  const [all, setAll] = useState(false);
  const byVar = useMemo(() => new Map(view.tokens.list.map((t) => [t.cssVar, t])), [view.tokens.list]);
  const byValue = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of view.tokens.list) {
      if (!t.normalised) continue;
      m.set(t.normalised, [...(m.get(t.normalised) ?? []), t.path]);
    }
    return m;
  }, [view.tokens.list]);

  if (!styles || (sel?.kind === "node" && styles.id !== sel.id)) return <p className="rv-empty">Reading styles…</p>;
  const s = styles.styles;
  const hasTokens = view.tokens.list.length > 0;

  function mapping(e: StyleEntry): { kind: "token" | "var" | "value" | "off" | "none"; text: string } {
    if (e.vars.length) {
      const hit = e.vars.map((v) => byVar.get(v)).find(Boolean);
      if (hit) return { kind: "token", text: hit.path };
      return { kind: "var", text: `${e.vars[0]}${hasTokens ? " (not in the token file)" : ""}` };
    }
    if (!hasTokens || !TOKENISED.has(e.prop) || e.isDefault) return { kind: "none", text: "" };
    const v = e.value;
    if (!v || v === "0px" || v === "normal" || v === "none" || v === "rgba(0, 0, 0, 0)" || v === "auto") return { kind: "none", text: "" };
    const n = normaliseValue(v);
    const hits = n ? byValue.get(n) : undefined;
    if (hits?.length) return { kind: "value", text: hits.join(", ") };
    return { kind: "off", text: "off-token" };
  }

  let off = 0;
  const groups = Object.entries(s.groups).map(([group, entries]) => {
    const shown = entries.filter((e) => all || !e.isDefault);
    const rows = shown.map((e) => {
      const m = mapping(e);
      if (m.kind === "off") off++;
      return { e, m };
    });
    return { group, rows };
  });

  return (
    <div className="rv-section">
      <BoxModel box={s.box} onLayer={onBoxLayer} />
      {!hasTokens ? (
        <p className="rv-note">
          This flow has no token file, so values are shown as they are. Add a DTCG JSON page to the flow to see which token
          each value comes from.
        </p>
      ) : off ? (
        <p className="rv-warn">{off} value{off === 1 ? "" : "s"} on this element match no token.</p>
      ) : null}
      {s.unreadableSheets ? (
        <p className="rv-note">{s.unreadableSheets} stylesheet{s.unreadableSheets === 1 ? " is" : "s are"} loaded from elsewhere and cannot be read, so tokens used there are not shown.</p>
      ) : null}
      <label className="rv-check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show default values
      </label>
      {groups.map(({ group, rows }) =>
        rows.length ? (
          <section key={group} className="rv-style-group">
            <h4>{group}</h4>
            <table className="rv-styles">
              <tbody>
                {rows.map(({ e, m }) => (
                  <tr key={e.prop} className={m.kind === "off" ? "is-off" : ""}>
                    <th>{e.prop}</th>
                    <td>
                      {/^(rgb|#)/.test(e.value) ? <span className="rv-swatch" style={{ background: e.value }} /> : null}
                      <code>{e.value}</code>
                      {m.kind !== "none" ? (
                        <span className={`rv-token rv-token-${m.kind}`} title={m.kind === "value" ? "Same value as this token, though not written as it" : undefined}>
                          {m.kind === "value" ? `= ${m.text}` : m.text}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null,
      )}
    </div>
  );
}

function BoxModel({ box, onLayer }: { box: Styles["box"]; onLayer: (l: string | null) => void }) {
  const sides = (v: number[]) => v.map((n) => (n ? String(n) : "–"));
  const [mt, mr, mb, ml] = sides(box.margin);
  const [bt, br, bb, bl] = sides(box.border);
  const [pt, pr, pb, pl] = sides(box.padding);
  const layer = (name: string) => ({ onMouseEnter: () => onLayer(name), onMouseLeave: () => onLayer(null) });
  return (
    <div className="rv-box" aria-label="Box model">
      <div className="rv-box-m" {...layer("margin")}>
        <span className="rv-box-tag">margin</span>
        <span className="rv-box-t">{mt}</span>
        <div className="rv-box-row">
          <span>{ml}</span>
          <div className="rv-box-b" {...layer("border")}>
            <span className="rv-box-tag">border</span>
            <span className="rv-box-t">{bt}</span>
            <div className="rv-box-row">
              <span>{bl}</span>
              <div className="rv-box-p" {...layer("padding")}>
                <span className="rv-box-tag">padding</span>
                <span className="rv-box-t">{pt}</span>
                <div className="rv-box-row">
                  <span>{pl}</span>
                  <div className="rv-box-c" {...layer("content")}>
                    {box.content[0]} × {box.content[1]}
                  </div>
                  <span>{pr}</span>
                </div>
                <span className="rv-box-t">{pb}</span>
              </div>
              <span>{br}</span>
            </div>
            <span className="rv-box-t">{bb}</span>
          </div>
          <span>{mr}</span>
        </div>
        <span className="rv-box-t">{mb}</span>
      </div>
    </div>
  );
}

// ---- Content ------------------------------------------------------------------

const ITEM_FLAG = ["item"];

function ContentTab(props: Props) {
  const { sel, node, view, editable, onEdit, nodesById, onSelectNode } = props;
  const keys = useMemo(() => ["content", "bind", "sample", "empty", "format", "max", "repeat", "item"], []);
  const d = useDraft(node, keys, view.version, ITEM_FLAG);
  const [bind, setBind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = node
    ? view.nodes.filter((n) => n.parent === node.id && n.attrs.bind && (n.tag === "span" || n.attrs.origin === "postit"))
    : [];

  const inRepeater = node?.ancestors.map((a) => nodesById.get(a)).find((a) => a?.attrs.repeat);

  if (sel?.kind === "range") {
    const host = nodesById.get(sel.pid);
    return (
      <div className="rv-section">
        <p>
          Selected <q>{sel.quote}</q> in <strong>{host?.slug ?? sel.pid}</strong>.
        </p>
        {editable ? (
          <>
            <Field name="bind" label="Mark these words as dynamic, from">
              <input className="rv-input" list="pi-resources" value={bind} onChange={(e) => setBind(e.target.value)} placeholder="user/firstName" />
            </Field>
            <GrammarHint value={bind} />
            <Suggest id="pi-resources" options={view.vocabulary.resources} />
            {error ? <p className="rv-error">{error}</p> : null}
            <button
              type="button"
              className="btn btn-small"
              disabled={!bind.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await onEdit({
                  op: "wrap",
                  pid: sel.pid,
                  start: sel.start,
                  end: sel.end,
                  attrs: { content: "dynamic", bind: bind.trim(), sample: sel.quote },
                });
                setBusy(false);
                if (!r.ok) setError(r.error ?? "Could not save.");
                else if (r.id) onSelectNode(r.id);
              }}
            >
              {busy ? "Saving…" : "Mark as dynamic"}
            </button>
            <p className="rv-field-hint">
              Wraps the words in a <code>&lt;span&gt;</code> with its own id, so the rest of the sentence stays static copy.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  if (!node) return null;

  return (
    <div className="rv-section">
      <Field name="content" label="Content">
        <select className="rv-input" {...d.field("content")} disabled={!editable}>
          <option value="">Not said</option>
          <option value="static">Static copy</option>
          <option value="dynamic">Dynamic</option>
        </select>
      </Field>
      {d.draft.content === "dynamic" || d.draft.bind ? (
        <>
          <Field name="bind" label="Comes from" hint={inRepeater ? `Inside a list over ${inRepeater.attrs.repeat}: start the path with it for one item's field.` : undefined}>
            <input className="rv-input" list="pi-resources" {...d.field("bind")} disabled={!editable} placeholder={inRepeater ? `${inRepeater.attrs.repeat}/name` : "user/firstName"} />
          </Field>
          <GrammarHint value={d.draft.bind ?? ""} />
          <Field name="sample" label="Sample value">
            <input className="rv-input" {...d.field("sample")} disabled={!editable} placeholder={node.text.slice(0, 40)} />
          </Field>
          <Field name="empty" label="When empty, show">
            <input className="rv-input" {...d.field("empty")} disabled={!editable} />
          </Field>
          <Field name="format" label="Format">
            <input className="rv-input" {...d.field("format")} disabled={!editable} placeholder="currency:GBP, date:relative" />
          </Field>
          <Field name="max" label="Maximum length">
            <input className="rv-input" type="number" min={1} {...d.field("max")} disabled={!editable} />
          </Field>
        </>
      ) : null}
      <Suggest id="pi-resources" options={view.vocabulary.resources} />

      <h4>List</h4>
      <Field name="repeat" label="Repeats over" hint="A list resource. Then mark one child as the item template.">
        <input className="rv-input" list="pi-resources" {...d.field("repeat")} disabled={!editable} placeholder="orders[]" />
      </Field>
      {inRepeater || node.attrs.item !== undefined ? (
        <label className="rv-check">
          <input
            type="checkbox"
            checked={!!d.draft.item}
            onChange={(e) => d.setDraft((x) => ({ ...x, item: e.target.checked ? "on" : "" }))}
            disabled={!editable}
          />{" "}
          This is the item template <code>data-pi-item</code>
        </label>
      ) : null}

      <SaveBar dirty={d.dirty} editable={editable} onReset={d.reset} onSave={() => onEdit({ op: "set", pid: node.id, set: d.changes() })} />

      <h4>Dynamic words</h4>
      {words.length === 0 ? (
        <p className="rv-muted">None. Select words in the mockup to bind part of a sentence.</p>
      ) : (
        <ul className="rv-list">
          {words.map((w) => (
            <li key={w.id}>
              <q>{w.text}</q> from <code>{w.attrs.bind}</code>{" "}
              <button type="button" className="rv-linkbtn" onClick={() => onSelectNode(w.id)}>
                Edit
              </button>
              {editable ? (
                <button type="button" className="rv-linkbtn" onClick={() => void onEdit({ op: "unwrap", pid: w.id })}>
                  Make static
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Behavior -----------------------------------------------------------------

function destinationOptions(view: MockupView) {
  const screens = view.flow?.screens ?? [];
  const current = view.screen.screen ?? view.node.name;
  const all = screens.length ? screens : [{ pageId: view.node.id, slug: current, name: view.node.name, nodes: view.nodes }];
  const nodes: { value: string; label: string }[] = [];
  for (const s of all) {
    const list = s.pageId === view.node.id ? view.nodes : s.nodes;
    for (const n of list) {
      if (!n.slug) continue;
      nodes.push({ value: `${s.slug}/${n.slug}`, label: `${s.name}: ${n.slug}` });
    }
  }
  return { screens: all.map((s) => ({ value: s.slug, label: s.name })), nodes };
}

function DestinationField({
  name,
  label,
  value,
  onChange,
  view,
  editable,
  onGo,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  view: MockupView;
  editable: boolean;
  onGo: (to: string) => void;
}) {
  const dest: Destination | null = value ? parseDestination(value) : null;
  const kind = dest ? (dest.kind === "invalid" ? "raw" : dest.kind) : "";
  const opts = useMemo(() => destinationOptions(view), [view]);
  const target =
    dest?.kind === "screen" ? dest.screen : dest?.kind === "node" || dest?.kind === "modal" ? dest.path.join("/") : dest?.kind === "url" ? dest.url : value;

  const set = (k: string, t: string) => {
    if (!k) return onChange("");
    if (k === "back") return onChange("back");
    if (k === "raw") return onChange(t);
    onChange(`${k}:${t}`);
  };

  return (
    <Field name={name} label={label}>
      <div className="rv-dest">
        <select className="rv-input" value={kind} disabled={!editable} onChange={(e) => set(e.target.value, e.target.value === "screen" ? opts.screens[0]?.value ?? "" : "")}>
          <option value="">Nowhere</option>
          <option value="screen">Screen</option>
          <option value="node">Node</option>
          <option value="modal">Modal or drawer</option>
          <option value="back">Back</option>
          <option value="url">External URL</option>
          {kind === "raw" ? <option value="raw">As written</option> : null}
        </select>
        {kind === "screen" ? (
          <select className="rv-input" value={target} disabled={!editable} onChange={(e) => set("screen", e.target.value)}>
            {!opts.screens.some((s) => s.value === target) ? <option value={target}>{target} (missing)</option> : null}
            {opts.screens.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : kind === "node" || kind === "modal" ? (
          <>
            <input className="rv-input" list={`pi-dest-${name}`} value={target} disabled={!editable} onChange={(e) => set(kind, e.target.value)} placeholder="screen/node-slug" />
            <datalist id={`pi-dest-${name}`}>
              {opts.nodes.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </datalist>
          </>
        ) : kind === "url" || kind === "raw" ? (
          <input className="rv-input" value={target} disabled={!editable} onChange={(e) => set(kind, e.target.value)} placeholder="https://" />
        ) : null}
        {dest && dest.kind !== "invalid" && dest.kind !== "url" ? (
          <button type="button" className="rv-linkbtn" onClick={() => onGo(formatDestination(dest))}>
            Go to
          </button>
        ) : null}
      </div>
    </Field>
  );
}

function BehaviorTab({ node, view, editable, onEdit, onNavigate }: Props) {
  const keys = useMemo(() => ["action", "trigger", "effect", "to", "to-failure"], []);
  const d = useDraft(node, keys, view.version);
  if (!node) return null;
  return (
    <div className="rv-section">
      <Field name="action" label="Action">
        <input className="rv-input" list="pi-actions" {...d.field("action")} disabled={!editable} placeholder="action/signup/add-address" />
      </Field>
      <GrammarHint value={d.draft.action ?? ""} />
      <Suggest id="pi-actions" options={view.vocabulary.actions} />
      <Field name="trigger" label="Trigger">
        <select className="rv-input" {...d.field("trigger")} disabled={!editable}>
          <option value="">click (default)</option>
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field name="effect" label="Side effects" hint="Any names, separated by spaces.">
        <input className="rv-input" list="pi-effects" {...d.field("effect")} disabled={!editable} placeholder="api/address/create analytics/address-added" />
      </Field>
      <Suggest id="pi-effects" options={view.vocabulary.effects} />
      <DestinationField name="to" label="On success, go to" value={d.draft.to ?? ""} onChange={(v) => d.setDraft((x) => ({ ...x, to: v }))} view={view} editable={editable} onGo={onNavigate} />
      <DestinationField name="to-failure" label="On failure, go to or show" value={d.draft["to-failure"] ?? ""} onChange={(v) => d.setDraft((x) => ({ ...x, "to-failure": v }))} view={view} editable={editable} onGo={onNavigate} />
      <SaveBar dirty={d.dirty} editable={editable} onReset={d.reset} onSave={() => onEdit({ op: "set", pid: node.id, set: d.changes() })} />
    </div>
  );
}

// ---- Inputs -------------------------------------------------------------------

function InputsTab({ node, view, editable, onEdit }: Props) {
  const keys = useMemo(() => ["field", "validate"], []);
  const d = useDraft(node, keys, view.version);
  if (!node) return null;
  const rules = (d.draft.validate ?? "").split(";").map((r) => r.trim()).filter(Boolean);
  const setRules = (next: string[]) => d.setDraft((x) => ({ ...x, validate: next.join("; ") }));
  return (
    <div className="rv-section">
      <Field name="field" label="Writes to">
        <input className="rv-input" list="pi-fields" {...d.field("field")} disabled={!editable} placeholder="address/postcode" />
      </Field>
      <GrammarHint value={d.draft.field ?? ""} />
      <Suggest id="pi-fields" options={[...view.vocabulary.fields, ...view.vocabulary.resources]} />
      <h4>Validation</h4>
      <ul className="rv-rules">
        {rules.map((r, i) => (
          <li key={i}>
            <input
              className="rv-input"
              value={r}
              disabled={!editable}
              onChange={(e) => setRules(rules.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {editable ? (
              <button type="button" className="rv-linkbtn" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="rv-chips">
          {["required", "min:", "max:", "pattern:", "email", "matches:"].map((r) => (
            <button key={r} type="button" className="rv-chip-btn" onClick={() => setRules([...rules, r])}>
              + {r.replace(":", "")}
            </button>
          ))}
        </div>
      ) : null}
      <SaveBar dirty={d.dirty} editable={editable} onReset={d.reset} onSave={() => onEdit({ op: "set", pid: node.id, set: d.changes() })} />
    </div>
  );
}

// ---- States -------------------------------------------------------------------

function StatesTab({ node, view, editable, onEdit, onPreviewState, previewed, nodesById, onSelectNode }: Props) {
  const keys = useMemo(() => ["states", "visible-if"], []);
  const d = useDraft(node, keys, view.version);
  const [adding, setAdding] = useState("");
  if (!node) return null;
  const states = (d.draft.states ?? "").split(/\s+/).filter(Boolean);
  const depictions = view.nodes.filter((n) => n.attrs["state-of"] === node.id);
  const depicts = node.attrs["state-of"] ? nodesById.get(node.attrs["state-of"]) : undefined;

  return (
    <div className="rv-section">
      {depicts ? (
        <p className="rv-note">
          This element depicts <button type="button" className="rv-linkbtn" onClick={() => onSelectNode(depicts.id)}>{depicts.slug ?? depicts.id}</button> in
          its <strong>{node.attrs.state}</strong> state. It is hidden in review unless that state is previewed.
        </p>
      ) : null}
      <h4>States</h4>
      <div className="rv-chips">
        {states.map((s) => {
          const has = s === "default" || depictions.some((dp) => dp.attrs.state === s);
          const on = previewed?.id === node.id && previewed.state === s;
          return (
            <span key={s} className={`rv-state ${has ? "" : "is-missing"} ${on ? "is-on" : ""}`}>
              <button
                type="button"
                className="rv-state-btn"
                disabled={s === "default" ? false : !has}
                title={has ? "Preview this state" : "No element depicts this state yet"}
                onClick={() => onPreviewState(node.id, s === "default" ? null : on ? null : s)}
              >
                {s}
              </button>
              {editable ? (
                <button type="button" className="rv-state-x" aria-label={`Remove ${s}`} onClick={() => d.setDraft((x) => ({ ...x, states: states.filter((y) => y !== s).join(" ") }))}>
                  ×
                </button>
              ) : null}
            </span>
          );
        })}
        {states.length === 0 ? <span className="rv-muted">None declared.</span> : null}
      </div>
      {editable ? (
        <form
          className="rv-inline"
          onSubmit={(e) => {
            e.preventDefault();
            const s = adding.trim().replace(/\s+/g, "-");
            if (s && !states.includes(s)) d.setDraft((x) => ({ ...x, states: [...states, s].join(" ") }));
            setAdding("");
          }}
        >
          <input className="rv-input" list="pi-states" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a state" />
          <datalist id="pi-states">
            {["default", "hover", "focus", "active", "disabled", "loading", "error", "success", "empty", "selected"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button type="submit" className="btn btn-secondary btn-small">Add</button>
        </form>
      ) : null}
      {states.some((s) => s !== "default" && !depictions.some((dp) => dp.attrs.state === s)) ? (
        <p className="rv-field-hint">
          States without a picture are listed but cannot be previewed. The designer adds an element with{" "}
          <code>data-pi-state-of=&quot;{node.id}&quot;</code> and <code>data-pi-state</code> to show one.
        </p>
      ) : null}
      {depictions.length ? (
        <>
          <h4>Depictions</h4>
          <ul className="rv-list">
            {depictions.map((dp) => (
              <li key={dp.id}>
                <strong>{dp.attrs.state}</strong>:{" "}
                <button type="button" className="rv-linkbtn" onClick={() => onSelectNode(dp.id)}>
                  {dp.slug ?? dp.id}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h4>Visibility</h4>
      <Field name="visible-if" label="Shown only when" hint="Leave empty if it is always shown. Use Hide conditional in the toolbar to see the page without these.">
        <input className="rv-input" list="pi-resources" {...d.field("visible-if")} disabled={!editable} placeholder="user/isLoggedIn" />
      </Field>
      <Suggest id="pi-resources" options={view.vocabulary.resources} />
      <SaveBar dirty={d.dirty} editable={editable} onReset={d.reset} onSave={() => onEdit({ op: "set", pid: node.id, set: d.changes() })} />
    </div>
  );
}

// ---- Comments -----------------------------------------------------------------

function anchorForSelection(sel: Selection, nodesById: Map<string, SpecNode>): CommentAnchor | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "node": {
      const n = nodesById.get(sel.id);
      return { kind: "node", pid: sel.id, slug: n?.slug ?? null, text: n?.text?.slice(0, 200) };
    }
    case "range":
      return { kind: "range", pid: sel.pid, start: sel.start, end: sel.end, quote: sel.quote, slug: nodesById.get(sel.pid)?.slug ?? null };
    case "region":
      return { kind: "region", rect: sel.rect, viewport: sel.viewport, covered: sel.covered };
    case "element":
      return { kind: "element", selector: sel.element.selector, fingerprint: sel.element.fingerprint };
  }
}

function relevant(c: Anchored, sel: Selection): boolean {
  if (!sel) return true;
  const pid = sel.kind === "node" ? sel.id : sel.kind === "range" ? sel.pid : null;
  if (pid) return anchorPid(c.anchor) === pid;
  if (sel.kind === "element" && c.anchor?.kind === "element") return c.anchor.selector === sel.element.selector;
  return false;
}

function CommentsTab(props: Props) {
  const { sel, view, anchored, orphaned, nodesById, onComment, activeComment, onActivateComment } = props;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"here" | "all">("here");
  const [show, setShow] = useState<"active" | "all">("active");

  const anchor = anchorForSelection(sel, nodesById);
  const pageLevel = view.comments.filter((c) => !c.parent_id && !c.deleted && !c.anchor);
  const replies = (id: string) => view.comments.filter((c) => c.parent_id === id);
  const visible = (c: Comment) => show === "all" || (c.status !== "resolved" && c.status !== "wont_fix");

  const here = sel ? anchored.filter((c) => relevant(c, sel)) : [];
  const list = (sel && scope === "here" ? here : anchored).filter(visible);
  const orphans = anchored.filter((c) => orphaned.has(c.id));

  useEffect(() => {
    if (activeComment && sel && !here.some((c) => c.id === activeComment)) setScope("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeComment]);

  return (
    <div className="rv-section">
      <form
        className="rv-composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setBusy(true);
          setError(null);
          const r = await onComment(body, anchor);
          setBusy(false);
          if (!r.ok) setError(r.error ?? "Could not post that.");
          else setBody("");
        }}
      >
        <label className="rv-field-label" htmlFor="rv-comment">
          Comment on {anchor ? describeAnchor(anchor) : "this screen as a whole"}
        </label>
        <textarea id="rv-comment" className="rv-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should change?" />
        {error ? <p className="rv-error">{error}</p> : null}
        <button type="submit" className="btn btn-small" disabled={busy || !body.trim()}>
          {busy ? "Posting…" : "Comment"}
        </button>
      </form>

      <div className="rv-comment-filters">
        {sel ? (
          <select className="rv-select" value={scope} onChange={(e) => setScope(e.target.value as "here" | "all")}>
            <option value="here">On this selection ({here.length})</option>
            <option value="all">On this screen ({anchored.length})</option>
          </select>
        ) : null}
        <select className="rv-select" value={show} onChange={(e) => setShow(e.target.value as "active" | "all")}>
          <option value="active">Open and addressed</option>
          <option value="all">Everything</option>
        </select>
      </div>

      {list.length === 0 ? <p className="rv-muted">No comments here yet.</p> : null}
      {list.map((c) => (
        <Thread
          key={c.id}
          c={c}
          replies={replies(c.id)}
          props={props}
          active={c.id === activeComment}
          orphan={orphaned.has(c.id)}
          onActivate={() => onActivateComment(c.id)}
        />
      ))}

      {orphans.length ? (
        <section className="rv-orphans">
          <h4>Orphaned</h4>
          <p className="rv-field-hint">
            These were made on elements that are no longer in this version. Select where each belongs now and attach it,
            or resolve it.
          </p>
          {orphans.map((c) => (
            <Thread key={c.id} c={c} replies={replies(c.id)} props={props} active={c.id === activeComment} orphan onActivate={() => onActivateComment(c.id)} />
          ))}
        </section>
      ) : null}

      {!sel && pageLevel.filter(visible).length ? (
        <section>
          <h4>About the whole screen</h4>
          {pageLevel.filter(visible).map((c) => (
            <Thread key={c.id} c={{ ...c, n: 0 }} replies={replies(c.id)} props={props} active={false} orphan={false} onActivate={() => undefined} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Thread({
  c,
  replies,
  props,
  active,
  orphan,
  onActivate,
}: {
  c: Anchored;
  replies: Comment[];
  props: Props;
  active: boolean;
  orphan: boolean;
  onActivate: () => void;
}) {
  const { view, onStatus, onComment, onReattach, onRemoveComment, sel, nodesById } = props;
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<null | "addressed" | "wont_fix">(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = c.status ?? null;
  const isAuthor = view.isAuthor;
  const mine = c.author_id === view.viewerId;
  const target = anchorForSelection(sel, nodesById);

  const act = async (s: string, n: string | null) => {
    setError(null);
    const r = await onStatus(c.id, s, n);
    if (!r.ok) setError(r.error ?? "Could not change that.");
    else {
      setActing(null);
      setNote("");
    }
  };

  return (
    <article className={`rv-thread ${active ? "is-active" : ""} rv-status-${status ?? "none"}`}>
      <header onClick={onActivate} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onActivate()}>
        {c.n ? <span className={`rv-pin rv-pin-${status ?? "open"}`}>{c.n}</span> : null}
        <span className="rv-muted">{c.author_email}</span>
        {status ? <span className={`rv-status rv-status-chip-${status}`}>{STATUS_LABELS[status]}</span> : null}
        {c.anchor ? <span className="rv-anchor">on {describeAnchor(c.anchor)}</span> : null}
        {c.content_version && c.content_version !== view.version ? <span className="rv-muted">(made on v{c.content_version})</span> : null}
      </header>
      <p className="rv-thread-body">{c.body}</p>
      {c.status_note ? (
        <p className="rv-thread-note">
          {status === "addressed" ? `Addressed${c.status_version ? ` in v${c.status_version}` : ""}` : status === "wont_fix" ? "Won't fix" : "Note"}
          {c.status_by_email ? ` by ${c.status_by_email}` : ""}: {c.status_note}
        </p>
      ) : status === "resolved" && c.status_by_email ? (
        <p className="rv-thread-note">Resolved by {c.status_by_email}</p>
      ) : null}
      {replies.filter((r) => !r.deleted).map((r) => (
        <div key={r.id} className="rv-reply">
          <span className="rv-muted">{r.author_email}</span>
          <p>{r.body}</p>
        </div>
      ))}
      {error ? <p className="rv-error">{error}</p> : null}
      {active ? (
        <div className="rv-thread-actions">
          {acting ? (
            <form
              className="rv-inline"
              onSubmit={(e) => {
                e.preventDefault();
                void act(acting, note);
              }}
            >
              <input className="rv-input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={acting === "addressed" ? "What changed?" : "Why not?"} />
              <button type="submit" className="btn btn-small" disabled={!note.trim()}>
                {acting === "addressed" ? `Addressed in v${view.node.content_version}` : "Won't fix"}
              </button>
              <button type="button" className="rv-linkbtn" onClick={() => setActing(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              {isAuthor && (status === "open" || status === null) ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setActing("addressed")}>
                  Mark addressed
                </button>
              ) : null}
              {!isAuthor && status !== "resolved" ? (
                <button type="button" className="btn btn-small" onClick={() => void act("resolved", null)}>
                  Resolve
                </button>
              ) : null}
              {!isAuthor && (status === "addressed" || status === "resolved" || status === "wont_fix") ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => void act("open", null)}>
                  Reopen
                </button>
              ) : null}
              {status !== "wont_fix" && status !== "resolved" ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setActing("wont_fix")}>
                  Won&apos;t fix
                </button>
              ) : null}
              {orphan && target && (target.kind === "node" || target.kind === "range") ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={async () => {
                  const r = await onReattach(c.id, target);
                  if (!r.ok) setError(r.error ?? "Could not move it.");
                }}>
                  Attach to {describeAnchor(target)}
                </button>
              ) : null}
              {mine ? (
                <button type="button" className="rv-linkbtn" onClick={() => void onRemoveComment(c.id)}>
                  Withdraw
                </button>
              ) : null}
            </>
          )}
          <form
            className="rv-inline"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              const r = await onComment(reply, null, c.id);
              if (r.ok) setReply("");
              else setError(r.error ?? "Could not reply.");
            }}
          >
            <input className="rv-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply" />
            <button type="submit" className="btn btn-secondary btn-small" disabled={!reply.trim()}>
              Reply
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

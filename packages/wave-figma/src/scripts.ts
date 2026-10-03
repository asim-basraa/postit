/**
 * Scripts for Figma's plugin API, run through the Figma MCP `use_figma` tool.
 *
 * The MCP answers in text and cuts a result off at about 20 KB, so every script
 * returns compact data and a checksum of it. The agent saves what it got, runs
 * `checksum` on its copy and compares: a copy that does not match is never used.
 *
 * Each script is plain JavaScript with top-level await and a `return`, as
 * `use_figma` expects. Placeholders are filled in by `script()`.
 */

import { inspectNodes } from "./gate";

/** djb2 over UTF-16 code units, the same in the plugin and in Node. */
export function checksum(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

const CHECKSUM_JS = `const checksum = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };`;

/** Pages, frames on a page, local components, variable collections and styles. */
export const INVENTORY = `
const pages = figma.root.children.map((p) => ({ id: p.id, name: p.name }));
const cols = (await figma.variables.getLocalVariableCollectionsAsync()).map((c) => ({ name: c.name, count: c.variableIds.length, modes: c.modes.map((m) => m.name) }));
const text = (await figma.getLocalTextStylesAsync()).length;
const effects = (await figma.getLocalEffectStylesAsync()).length;
const page = await figma.getNodeByIdAsync("{{PAGE}}");
await figma.setCurrentPageAsync(page);
const frames = page.children.filter((n) => n.type === "FRAME" || n.type === "SECTION").map((n) => ({ id: n.id, type: n.type, name: n.name, width: Math.round(n.width), height: Math.round(n.height) }));
const sets = page.findAllWithCriteria({ types: ["COMPONENT_SET"] }).map((s) => ({ id: s.id, name: s.name, description: s.description, variants: s.children.length }));
const lone = page.findAllWithCriteria({ types: ["COMPONENT"] }).filter((c) => !c.parent || c.parent.type !== "COMPONENT_SET").map((c) => ({ id: c.id, name: c.name, description: c.description }));
return { pages, collections: cols, textStyles: text, effectStyles: effects, frames, componentSets: sets, components: lone, start: page.flowStartingPoints };
`;

/**
 * Every local variable, one per line: collection initial | name | type initial |
 * resolved value | alias target? | "# " description?. Colours as #RRGGBB(AA).
 * Returns the listing in parts of at most 15 000 characters, plus the checksum of the whole.
 */
export const VARIABLES = `
${CHECKSUM_JS}
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const out = [];
for (const c of cols) {
  for (const id of c.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    let val = v.valuesByMode[c.defaultModeId], alias = null, g = 0;
    while (val && typeof val === "object" && val.type === "VARIABLE_ALIAS" && g++ < 10) {
      const t = await figma.variables.getVariableByIdAsync(val.id);
      if (!alias) alias = t.name;
      const tc = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
      val = t.valuesByMode[tc.defaultModeId];
    }
    if (val && typeof val === "object" && "r" in val) {
      const h = (x) => Math.round(x * 255).toString(16).padStart(2, "0").toUpperCase();
      val = "#" + h(val.r) + h(val.g) + h(val.b) + (val.a !== undefined && val.a < 1 ? h(val.a) : "");
    }
    out.push(c.name[0] + "|" + v.name + "|" + v.resolvedType[0] + "|" + (typeof val === "number" ? +val.toFixed(4) : val) + (alias ? "|" + alias : "") + (v.description ? "|# " + v.description.replace(/\\n/g, " ") : ""));
  }
}
const s = out.join("\\n");
const part = {{PART}};
const size = 15000;
return { lines: out.length, length: s.length, checksum: checksum(s), parts: Math.ceil(s.length / size), part, text: s.slice(part * size, (part + 1) * size) };
`;

/** Text and effect styles with the variables they are bound to. */
export const STYLES = `
const nm = async (b) => (b && b.type === "VARIABLE_ALIAS" ? (await figma.variables.getVariableByIdAsync(b.id)).name : null);
const hex = (c) => { const h = (x) => Math.round(x * 255).toString(16).padStart(2, "0").toUpperCase(); return "#" + h(c.r) + h(c.g) + h(c.b) + (c.a !== undefined && c.a < 1 ? h(c.a) : ""); };
const text = [];
for (const s of await figma.getLocalTextStylesAsync()) {
  const b = s.boundVariables || {};
  const bindings = {};
  for (const k of Object.keys(b)) bindings[k] = await nm(b[k]);
  text.push({ name: s.name, family: s.fontName.family, style: s.fontName.style, size: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, bindings });
}
const effects = [];
for (const s of await figma.getLocalEffectStylesAsync()) for (const e of s.effects) {
  const b = e.boundVariables || {};
  const bindings = {};
  for (const k of Object.keys(b)) bindings[k] = await nm(b[k]);
  effects.push({ name: s.name, type: e.type, color: e.color ? hex(e.color) : null, x: e.offset ? e.offset.x : 0, y: e.offset ? e.offset.y : 0, radius: e.radius, spread: e.spread ?? 0, bindings });
}
return { text, effects };
`;

/**
 * For one frame or component: every instance (with its component, variant
 * properties and text/boolean properties), every prototype link, and the node
 * ids of vector icons, so the agent can export them as SVG.
 */
export const NODE_MAP = `
${CHECKSUM_JS}
const root = await figma.getNodeByIdAsync("{{NODE}}");
const page = (() => { let n = root; while (n && n.type !== "PAGE") n = n.parent; return n; })();
await figma.setCurrentPageAsync(page);
const instances = [];
for (const i of root.findAllWithCriteria({ types: ["INSTANCE"] })) {
  const m = await i.getMainComponentAsync();
  if (!m) continue;
  const set = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
  const variant = {}, props = {};
  for (const [k, v] of Object.entries(i.componentProperties || {})) {
    if (v.type === "VARIANT") variant[k] = v.value;
    else props[k.replace(/#.*$/, "")] = v.value;
  }
  instances.push({ id: i.id, main: m.id, component: set ? set.name : m.name, componentId: (set || m).id, variant, props });
}
const links = [];
for (const n of [root, ...root.findAll((n) => "reactions" in n && n.reactions && n.reactions.length)]) {
  for (const r of n.reactions || []) for (const a of r.actions || []) {
    const d = a.destinationId ? await figma.getNodeByIdAsync(a.destinationId) : null;
    links.push({ from: n.id, fromName: n.name, trigger: r.trigger && r.trigger.type, kind: a.type, navigation: a.navigation || null, to: d ? d.id : null, toName: d ? d.name : null, url: a.url || null, newTab: !!a.openInNewTab });
  }
}
const vectors = root.findAll((n) => n.type === "INSTANCE" && /^(icon|logo|mark)/i.test(n.name) || n.type === "VECTOR" && n.parent && n.parent.type !== "INSTANCE").map((n) => n.id);
const s = JSON.stringify({ instances, links, vectors });
return { checksum: checksum(s), length: s.length, data: s };
`;

/**
 * A component set (or single component) for its specimen: every variant with
 * its variant properties and size, the set's text and boolean properties, its
 * description, and the vector nodes inside it.
 */
export const COMPONENT = `
${CHECKSUM_JS}
const node = await figma.getNodeByIdAsync("{{NODE}}");
const page = (() => { let n = node; while (n && n.type !== "PAGE") n = n.parent; return n; })();
await figma.setCurrentPageAsync(page);
const isSet = node.type === "COMPONENT_SET";
const defs = {};
for (const [k, v] of Object.entries(node.componentPropertyDefinitions || {})) defs[k.replace(/#.*$/, "")] = { type: v.type, default: v.defaultValue, options: v.variantOptions || null };
const variants = (isSet ? node.children : [node]).map((c) => ({ id: c.id, name: c.name, variant: c.variantProperties || {}, x: isSet ? +c.x.toFixed(2) : 0, y: isSet ? +c.y.toFixed(2) : 0, width: +c.width.toFixed(2), height: +c.height.toFixed(2) }));
const vectors = node.findAll((n) => n.type === "INSTANCE" && /^(icon|logo|mark)/i.test(n.name)).map((n) => n.id);
const s = JSON.stringify({ id: node.id, name: node.name, description: node.description, width: Math.round(node.width), height: Math.round(node.height), properties: defs, variants, vectors });
return { checksum: checksum(s), length: s.length, data: s };
`;

/** SVG of each node in a list, for icons and logos. */
export const EXPORT_SVG = `
${CHECKSUM_JS}
const out = {};
for (const id of {{IDS}}) {
  const n = await figma.getNodeByIdAsync(id);
  if (n) out[id] = await n.exportAsync({ format: "SVG_STRING" });
}
const s = JSON.stringify(out);
return { checksum: checksum(s), length: s.length, data: s };
`;

/**
 * Shadows and blurs of every node under a node, with the variables they are
 * bound to. Figma's reference code drops a shadow's spread (a focus ring comes
 * out as drop-shadow(0 0 0 colour), which draws nothing), so the converter
 * writes these as box-shadow itself.
 */
export const EFFECTS = `
${CHECKSUM_JS}
const root = await figma.getNodeByIdAsync("{{NODE}}");
const names = {};
const vname = async (b) => { if (!b || !b.id) return null; if (!(b.id in names)) { const v = await figma.variables.getVariableByIdAsync(b.id); names[b.id] = v ? v.name : null; } return names[b.id]; };
const rgba = (c) => \`rgba(\${Math.round(c.r * 255)},\${Math.round(c.g * 255)},\${Math.round(c.b * 255)},\${+c.a.toFixed(3)})\`;
const out = {};
const nodes = [root, ...(root.findAll ? root.findAll((n) => Array.isArray(n.effects) && n.effects.length > 0) : [])].filter((n) => Array.isArray(n.effects) && n.effects.some((e) => e.visible !== false));
for (const n of nodes) {
  const list = [];
  for (const e of n.effects) {
    if (e.visible === false) continue;
    const bv = e.boundVariables || {};
    const item = { type: e.type, radius: e.radius, radiusVar: await vname(bv.radius) };
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") Object.assign(item, { x: e.offset.x, y: e.offset.y, spread: e.spread || 0, color: rgba(e.color), colorVar: await vname(bv.color), spreadVar: await vname(bv.spread), xVar: await vname(bv.offsetX), yVar: await vname(bv.offsetY) });
    list.push(item);
  }
  if (list.length) out[n.id] = list;
}
const s = JSON.stringify(out);
return { checksum: checksum(s), length: s.length, data: s };
`;

/**
 * The entry gate (see gate.ts): every page or frame in IDS is checked against
 * Wave's rules; PAGE is the design-system page. The rules run as inspectNodes'
 * own source. Returns the findings grouped by rule, at most 200 layers each, in
 * parts of at most 15 000 characters, plus the checksum of the whole.
 */
export const GATE = `
${CHECKSUM_JS}
const ids = {{IDS}};
const ds = "{{PAGE}}" || null;
const pageOf = (n) => { let x = n; while (x && x.type !== "PAGE") x = x.parent; return x ? x.id : null; };
const roots = [];
for (const id of ids) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) throw new Error("No node " + id);
  const p = n.type === "PAGE" ? n : await figma.getNodeByIdAsync(pageOf(n));
  await p.loadAsync();
  roots.push(n);
}
const vars = {}, defaultModes = {};
for (const c of await figma.variables.getLocalVariableCollectionsAsync()) defaultModes[c.id] = c.defaultModeId;
for (const v of await figma.variables.getLocalVariablesAsync()) vars[v.id] = { name: v.name, type: v.resolvedType, scopes: v.scopes, collection: v.variableCollectionId, values: v.valuesByMode };
const textStyles = (await figma.getLocalTextStylesAsync()).length;
const mains = {}, componentNames = [];
for (const r of roots) {
  for (const i of r.findAllWithCriteria({ types: ["INSTANCE"] })) {
    const m = await i.getMainComponentAsync();
    if (!m) continue;
    const set = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
    mains[i.id] = { name: (set || m).name, remote: !!m.remote, page: m.remote ? null : pageOf(m) };
  }
  for (const c of r.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
    if (c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET") continue;
    componentNames.push(c.name);
  }
}
const inspect = ${inspectNodes.toString()};
const { hits, fonts, covers } = inspect(roots, { vars, defaultModes, textStyles, mains, componentNames, dsPage: ds });
const grouped = {};
for (const h of hits) {
  const g = grouped[h.rule] || (grouped[h.rule] = { count: 0, nodes: [] });
  g.count++;
  if (g.nodes.length < 200) g.nodes.push([h.node, h.name, h.detail, h.in]);
}
const s = JSON.stringify({ file: figma.fileKey || null, pages: [...new Set(roots.map(pageOf))], covers, fonts, total: hits.length, hits: grouped });
const part = {{PART}};
const size = 15000;
return { checksum: checksum(s), length: s.length, parts: Math.ceil(s.length / size), part, data: s.slice(part * size, (part + 1) * size) };
`;

/** Fills in a script's placeholders. */
export function script(source: string, values: { PAGE?: string; NODE?: string; PART?: number; IDS?: string[] }): string {
  return source
    .replace(/\{\{PAGE\}\}/g, values.PAGE ?? "")
    .replace(/\{\{NODE\}\}/g, values.NODE ?? "")
    .replace(/\{\{PART\}\}/g, String(values.PART ?? 0))
    .replace(/\{\{IDS\}\}/g, JSON.stringify(values.IDS ?? []));
}

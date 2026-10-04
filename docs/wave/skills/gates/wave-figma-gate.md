---
name: Wave Figma Gate
description: Runs Wave's Figma entry gate on a Figma file, read-only, for a project in Post-it, and lists what to fix in Figma (blocking) and what is optional (advice), with a link to each layer. For the designer, from a chat with the Figma and Post-it connectors and no command line. Use when someone says "run the gate", "check my Figma file for Wave" or "is <project> ready for Wave".
---

# Wave Figma Gate

Wave takes a Figma file only when it passes the entry gate: the gate reads the
file and lists what Wave cannot take exactly as drawn. **Blocking** findings
are fixed in Figma; **advice** is optional. This skill lets the designer run
the gate as often as they like while fixing the file. It is a self-check: when
it passes, the engineer runs the official gate (Wave Figma) on that version.

## Rules

- **Read only.** Never change the Figma file and never offer to; the designer
  fixes it in Figma.
- **The script as published.** Run the gate script below exactly, changing
  only its three placeholders. Never edit, shorten, rewrite or re-create it.
- **The gate is the gate.** Report every finding as the gate gives it. Never
  call a blocking finding fine, and never suggest changing Wave to fit the file.
- **If anything cannot be reached** (the Figma connector, the file, a page,
  Post-it) or a script throws, stop and say exactly what failed. Never take
  another route to the same result.
- Load the Figma connector's `figma-use` skill before the first
  `use_figma`, as that connector requires.

## What you need from the designer

1. The **project** name in Post-it (for example "keel").
2. The **Figma links**: the design-system page and the screens page (each
   link with its `node-id`). A frame link works too: the gate checks that
   frame. Several screen pages or frames are fine.

Ask only for what is missing. If the project has a **Wave Figma progress**
article that lists the links, propose those.

## 1. Find the project

   - Find it with `list_spaces` and `list_tree` (projects are marked), by the name given.
   - Do not create anything. If there is no such project, say so and stop.
   - Read the project's **Figma entry gate** article if it exists: it is the
     last official result, to compare with.

## 2. Locate the nodes

Take the file key from the links (`figma.com/design/<file key>/...`) and each
`node-id` (`28-129` in a link is the node `28:129`). All links must be the
same file. Run this with `use_figma`, with `{{IDS}}` replaced by the ids as
a JSON array, for example `["28:129","1:86"]`:

```js
const ids = {{IDS}};
const out = [];
for (const id of ids) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) { out.push({ id, missing: true }); continue; }
  let p = n; while (p && p.type !== "PAGE") p = p.parent;
  out.push({ id, type: n.type, name: n.name, page: p ? p.id : null, pageName: p ? p.name : null });
}
return { file: figma.fileKey || null, nodes: out };
```

A node that is `missing` means a wrong link or no access: stop and say so.
The **design-system page** is the `page` of the design-system link.

## 3. Run the gate

Replace exactly these three placeholders, and nothing else:

- `{{IDS}}`: the ids from the links, as a JSON array, design system first.
- `{{PAGE}}`: the design-system page id from step 2.
- `{{PART}}`: `0`.

Run it with `use_figma` on the file key, description "Wave entry gate
(read-only)". It returns `checksum`, `length`, `parts`, `part` and
`data`. When `parts` is more than 1, run it again with `{{PART}}` as 1, 2
and so on, and join the `data` pieces in order: together they are one JSON
report of `length` characters.

```js

const checksum = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
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
    const hug = (axis) => m.layoutMode && m.layoutMode !== "NONE" && ((m.layoutMode === "HORIZONTAL") === (axis === "w") ? m.primaryAxisSizingMode : m.counterAxisSizingMode) === "AUTO";
    const bools = {};
    for (const [k, d] of Object.entries((set || m).componentPropertyDefinitions || {})) if (d.type === "BOOLEAN") bools[k] = d.defaultValue;
    const defs = (set || m).componentPropertyDefinitions || {};
    const stateKey = Object.keys(defs).find((k) => /^state$/i.test(k) && defs[k].type === "VARIANT");
    mains[i.id] = { name: (set || m).name, remote: !!m.remote, page: m.remote ? null : pageOf(m), width: m.width, height: m.height, hugW: !!hug("w"), hugH: !!hug("h"), bools, states: stateKey ? defs[stateKey].variantOptions || [] : [] };
  }
  for (const c of r.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
    if (c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET") continue;
    componentNames.push(c.name);
  }
}
const inspect = function inspectNodes(roots, facts) {
  const hits = [];
  const fonts = [];
  const covers = [];
  const areas = {};
  let top = "";
  const hit = (rule, n, detail) => hits.push({ rule, node: n.id, name: n.name, detail: detail || "", in: top });
  const vars = facts.vars;
  const all = Object.keys(vars).map((k) => vars[k]);
  const has = (type, scope) => all.some((v) => v.type === type && (v.scopes.indexOf(scope) >= 0 || v.scopes.indexOf("ALL_SCOPES") >= 0));
  const colorVars = all.some((v) => v.type === "COLOR");
  const scoped = { size: has("FLOAT", "WIDTH_HEIGHT"), gap: has("FLOAT", "GAP"), radius: has("FLOAT", "CORNER_RADIUS"), stroke: has("FLOAT", "STROKE_FLOAT"), opacity: has("FLOAT", "OPACITY"), effect: has("FLOAT", "EFFECT_FLOAT"), fontSize: has("FLOAT", "FONT_SIZE") };
  const names = facts.componentNames.map((s) => s.toLowerCase());
  const GRAPHIC = ["VECTOR", "BOOLEAN_OPERATION", "ELLIPSE", "RECTANGLE", "LINE", "STAR", "POLYGON"];
  const STYLE_FIELDS = ["fills", "strokes", "strokeWeight", "strokeAlign", "effects", "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "opacity", "fontSize", "fontName", "lineHeight", "letterSpacing", "textCase", "textDecoration", "textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId", "itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "layoutMode", "boundVariables"];
  const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Component|Instance|Auto layout|Section)( \d+)?$/;
  const mixed = (v) => typeof v === "symbol";
  const hex = (c) => "#" + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  const frac = (x) => typeof x === "number" && Math.abs(x - Math.round(x)) > 0.01;
  const resolve = (id, n, depth) => {
    const v = vars[id];
    if (!v || depth > 8) return null;
    const modes = n && n.resolvedVariableModes || {};
    const mode = modes[v.collection] || facts.defaultModes[v.collection];
    const val = mode in v.values ? v.values[mode] : v.values[Object.keys(v.values)[0]];
    return val && val.type === "VARIABLE_ALIAS" ? resolve(val.id, n, depth + 1) : val;
  };
  const paints = (n, key) => {
    const list = n[key];
    if (mixed(list) || !Array.isArray(list)) return;
    for (const p of list) {
      if (p.visible === false || p.opacity === 0) continue;
      if (p.type !== "SOLID") {
        if (/^GRADIENT/.test(p.type)) hit("color.gradient", n, key);
        continue;
      };
      const b = p.boundVariables && p.boundVariables.color;
      if (!b) {
        if (colorVars) hit("color.unbound", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}${p.opacity !== void 0 && p.opacity < 1 ? ` at ${Math.round(p.opacity * 100)}%` : ""}`);
        continue;
      };
      if (!vars[b.id]) {
        hit("variable.remote", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}`);
        continue;
      };
      const val = resolve(b.id, n, 0);
      if (val && typeof val === "object" && "r" in val) {
        const off = Math.max(Math.abs(val.r - p.color.r), Math.abs(val.g - p.color.g), Math.abs(val.b - p.color.b), Math.abs((val.a === void 0 ? 1 : val.a) - (p.opacity === void 0 ? 1 : p.opacity)));
        if (off > 1.5 / 255) hit("color.stale", n, `${key === "fills" ? "fill" : "stroke"} draws ${hex(p.color)}, its variable ${vars[b.id].name} is ${hex(val)}`);
      }
    }
  };
  const number = (n, key, on, rule, label, idle) => {
    if (!on) return;
    const v = n[key];
    if (typeof v !== "number" || v === idle) return;
    const b = n.boundVariables && n.boundVariables[key];
    if (!b) hit(rule, n, `${label} ${+v.toFixed(2)}`);
    else if (!vars[b.id]) hit("variable.remote", n, label);
  };
  const CORNERS = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  const SIDES = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
  const perSide = (n, keys, whole, on, rule, label) => {
    if (!on) return;
    const b = n.boundVariables || {};
    const loose = [];
    for (const k of keys) {
      const v = mixed(n[whole]) || n[whole] === void 0 ? n[k] : n[whole];
      if (typeof v !== "number" || v === 0) continue;
      const bk = b[k] || b[whole];
      if (!bk) loose.push(String(+v.toFixed(2)));
      else if (!vars[bk.id]) hit("variable.remote", n, label);
    };
    if (loose.length) hit(rule, n, `${label} ${[...new Set(loose)].join("/")}`);
  };
  const find = (n, id) => {
    if (n.id === id) return n;
    for (const c of n.children || []) {
      const f = find(c, id);
      if (f) return f;
    };
    return null;
  };
  const boundPaints = (n) => !!n && ["fills", "strokes"].every((k) => !Array.isArray(n[k]) || n[k].every((p) => p.visible === false || p.type !== "SOLID" || p.boundVariables && p.boundVariables.color));
  const effects = (n) => {
    const list = n.effects;
    if (!Array.isArray(list) || !list.some((e) => e.visible !== false)) return;
    if (typeof n.effectStyleId === "string" && n.effectStyleId) return;
    for (const e of list) {
      if (e.visible === false) continue;
      const b = e.boundVariables || {};
      const loose = [];
      if (e.color && colorVars && !b.color) loose.push(`color ${hex(e.color)}`);
      if (scoped.effect) for (const k of ["radius", "spread", "offsetX", "offsetY"]) {
        const v = k === "offsetX" ? e.offset && e.offset.x : k === "offsetY" ? e.offset && e.offset.y : e[k];
        if (typeof v === "number" && v !== 0 && !b[k]) loose.push(`${k} ${v}`);
      };
      if (loose.length) hit("effect.unbound", n, `${e.type.toLowerCase().replace("_", " ")}: ${loose.join(", ")}`);
    }
  };
  const absolute = (n, parent) => {
    if (!parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning !== "ABSOLUTE") return;
    if (Math.abs(n.x) > 0.01 || Math.abs(n.y) > 0.01) hit("layout.absolute", n, `at ${+n.x.toFixed(2)}, ${+n.y.toFixed(2)}`);
  };
  const fixedSize = (n, parent, where) => {
    if (!scoped.size || !parent && where === "screen" || n.type === "COMPONENT_SET") return;
    const b = n.boundVariables || {};
    const loose = [];
    const text = n.type === "TEXT";
    for (const [axis, sizing, size] of [["width", n.layoutSizingHorizontal, n.width], ["height", n.layoutSizingVertical, n.height]]) {
      if (sizing === "HUG" || sizing === "FILL" || !(size > 0)) continue;
      if (text && (n.textAutoResize === "WIDTH_AND_HEIGHT" || axis === "height" && n.textAutoResize === "HEIGHT")) continue;
      if (b[axis]) continue;
      loose.push(`${axis} ${+size.toFixed(2)}`);
    };
    if (loose.length) hit(text ? "text.fixed" : "size.fixed", n, loose.join(", "));
  };
  const shownByVariant = (n) => {
    const path = [];
    let v = n;
    while (v && !(v.type === "COMPONENT" && v.parent && v.parent.type === "COMPONENT_SET")) {
      path.unshift(v.name);
      v = v.parent;
    };
    if (!v) return false;
    return (v.parent.children || []).some((other) => {
      if (other === v) return false;
      let at = other;
      for (const name of path) {
        at = (at.children || []).find((c) => c.name === name);
        if (!at) return false;
      };
      return at.visible !== false;
    });
  };
  const ON = /^(selected|checked|on|active|current)$/i;
  const OFF = /^(default|unchecked|unselected|off|inactive)$/i;
  const SELECT = /(^|[^a-z])(select|dropdown|drop-down|combo ?box|picker)([^a-z]|$)/i;
  const CHOICE = /(^|[^a-z])(radio|checkbox|check box|chip|segment item|toggle|switch|tab|option|option card|menu item)([^a-z]|$)/i;
  const CONTAINER = /(^|[^a-z])(group|bar|list|control|menu|tabs)$/i;
  const MENU = /^(menu|listbox|options)$/i;
  const ROW = /(^|[^a-z])(option|item)([^a-z]|$)/i;
  const isSelect = (name) => SELECT.test(name) && !ROW.test(name);
  const stateOptions = (n) => {
    const defs = n.componentPropertyDefinitions || {};
    const key = Object.keys(defs).find((k) => /^state$/i.test(k) && defs[k].type === "VARIANT") || null;
    return { key, options: key ? (defs[key].variantOptions || []).map(String) : [] };
  };
  const findMenu = (n) => {
    for (const c of n.children || []) {
      if (c.visible === false) continue;
      if (MENU.test(String(c.name).trim())) return c;
      if (c.type !== "INSTANCE") {
        const f = findMenu(c);
        if (f) return f;
      }
    };
    return null;
  };
  const playable = (n) => {
    const name = String(n.name);
    const { key, options } = stateOptions(n);
    if (CHOICE.test(name) && !CONTAINER.test(name) && !isSelect(name)) {
      const on = options.filter((o) => ON.test(o));
      const off = options.filter((o) => OFF.test(o));
      if (!on.length || !off.length) hit("choice.state", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}; needs one chosen (Selected, Checked or On) and one not chosen (Default, Unchecked or Off)`);
    };
    if (!isSelect(name)) return;
    const open = options.find((o) => /^(open|expanded)$/i.test(o));
    if (!open) {
      hit("select.open", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}`);
      return;
    };
    const variant = (n.children || []).find((v) => v.variantProperties && v.variantProperties[key] === open);
    const menu = variant ? findMenu(variant) : null;
    if (!menu) {
      hit("select.menu", variant || n, `${name}: its ${open} variant has no layer named Menu`);
      return;
    };
    const rows = (menu.children || []).filter((c) => c.visible !== false);
    const bad = rows.filter((c) => {
      const m = c.type === "INSTANCE" ? facts.mains[c.id] : null;
      const st = m && m.states || [];
      return !m || !st.some((s) => ON.test(s)) || !st.some((s) => OFF.test(s));
    });
    if (rows.length < 2 || bad.length) hit("select.menu", menu, `${name}: Menu has ${rows.length} row${rows.length === 1 ? "" : "s"}${bad.length ? `, ${bad.length} not an instance of an option component with Selected and Default states` : ""}`);
  };
  const visit = (n, where, parent, owners) => {
    const t = n.type;
    if (t === "SECTION") {
      for (const c of n.children || []) visit(c, where, null, owners);
      return;
    };
    if (n.visible === false) {
      if (!(n.componentPropertyReferences && n.componentPropertyReferences.visible) && !shownByVariant(n)) hit("layer.hidden", n);
      return;
    };
    if (t === "INSTANCE") {
      const m = facts.mains[n.id];
      if (m && m.remote) hit("instance.remote", n, m.name);
      else if (m && facts.dsPage && m.page && m.page !== facts.dsPage) hit("instance.outside", n, m.name);
      const styled = [];
      let recolor = true;
      for (const o of n.overrides || []) for (const f of o.overriddenFields || []) {
        if (STYLE_FIELDS.indexOf(f) < 0) continue;
        if (styled.indexOf(f) < 0) styled.push(f);
        if (!((f === "fills" || f === "strokes") && boundPaints(find(n, o.id)))) recolor = false;
      };
      if (styled.length) hit(recolor ? "instance.recolor" : "instance.override", n, `${m ? m.name : "instance"}: ${styled.join(", ")}`);
      if (where === "screen" && m && /button|link|cta/i.test(m.name) && !(n.reactions && n.reactions.length)) hit("proto.unlinked", n, m.name);
      if (where === "screen" && m && m.states) {
        if (isSelect(m.name) && !m.states.some((o) => /^(open|expanded)$/i.test(o))) hit("select.open", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
        else if (CHOICE.test(m.name) && !CONTAINER.test(m.name) && !isSelect(m.name) && !(m.states.some((o) => ON.test(o)) && m.states.some((o) => OFF.test(o)))) hit("choice.state", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
      };
      if (m && m.bools) {
        const off = [];
        for (const k of Object.keys(m.bools)) {
          const p = n.componentProperties && n.componentProperties[k];
          if (p && p.value !== m.bools[k]) off.push(`${k.replace(/#.*$/, "")} ${p.value ? "on" : "off"}`);
        };
        if (off.length) hit("instance.boolean", n, `${m.name}: ${off.join(", ")}`);
      };
      if (m && m.width !== void 0) {
        const off = [];
        for (const [axis, hug, size, own2, sizing] of [["width", m.hugW, m.width, n.width, n.layoutSizingHorizontal], ["height", m.hugH, m.height, n.height, n.layoutSizingVertical]]) {
          if (sizing === "FILL") off.push(`${axis} fills its parent`);
          else if (hug && sizing === "FIXED") off.push(`${axis} fixed at ${+own2.toFixed(2)}, component hugs`);
          else if (!hug && Math.abs(own2 - size) > 0.5) off.push(`${axis} ${+own2.toFixed(2)}, component ${+size.toFixed(2)}`);
        };
        if (off.length) hit("instance.resized", n, `${m.name}: ${off.join("; ")}`);
      };
      absolute(n, parent);
      return;
    };
    const own = String(n.name).toLowerCase();
    if (t === "FRAME" && names.indexOf(own) >= 0 && owners.indexOf(own) < 0) hit("instance.detached", n, n.name);
    if ((t === "COMPONENT_SET" || t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET")) && !String(n.description || "").trim()) hit("component.description", n);
    if (t === "COMPONENT_SET" || t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET")) playable(n);
    if (t !== "TEXT" && t !== "COMPONENT_SET" && DEFAULT_NAME.test(n.name) && !(parent && parent.type === "COMPONENT_SET")) hit("layer.name", n);
    if (t !== "COMPONENT_SET") {
      paints(n, "fills");
      paints(n, "strokes");
      const stroked = Array.isArray(n.strokes) && n.strokes.some((p) => p.visible !== false);
      if (stroked) perSide(n, SIDES, "strokeWeight", scoped.stroke, "stroke.unbound", "stroke width");
      if (t !== "TEXT" && GRAPHIC.indexOf(t) < 0 || t === "RECTANGLE") perSide(n, CORNERS, "cornerRadius", scoped.radius, "radius.unbound", "radius");
      number(n, "opacity", scoped.opacity, "opacity.unbound", "opacity", 1);
      effects(n);
      if (stroked && n.strokeAlign === "INSIDE" && Array.isArray(n.effects) && n.effects.some((e) => e.visible !== false && e.type === "INNER_SHADOW")) hit("effect.under-stroke", n);
    };
    if (t === "TEXT") {
      const families = typeof n.getRangeAllFontNames === "function" && typeof n.characters === "string" ? n.getRangeAllFontNames(0, n.characters.length).map((f) => f.family) : n.fontName && !mixed(n.fontName) ? [n.fontName.family] : [];
      for (const f of families) if (fonts.indexOf(f) < 0) fonts.push(f);
      if (mixed(n.textStyleId) || mixed(n.fontName) || mixed(n.fontSize)) hit("text.mixed", n);
      else if (facts.textStyles > 0 ? !n.textStyleId : scoped.fontSize && !(n.boundVariables && n.boundVariables.fontSize)) hit("text.style", n, `${n.fontName ? n.fontName.family + " " + n.fontName.style : ""} ${n.fontSize}`.trim());
    };
    if (n.layoutMode && n.layoutMode !== "NONE") {
      number(n, "itemSpacing", scoped.gap, "spacing.unbound", "gap", 0);
      if (n.layoutWrap === "WRAP") number(n, "counterAxisSpacing", scoped.gap, "spacing.unbound", "row gap", 0);
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) number(n, k, scoped.gap, "spacing.unbound", k.replace("padding", "padding ").toLowerCase(), 0);
    };
    const kids = (n.children || []).filter((c) => c.visible !== false);
    const graphic = kids.length > 0 && kids.every((c) => GRAPHIC.indexOf(c.type) >= 0) && kids.some((c) => c.type !== "RECTANGLE" && c.type !== "ELLIPSE");
    const placed = kids.length > 1 || kids.length === 1 && (Math.abs(kids[0].x) > 0.01 || Math.abs(kids[0].y) > 0.01);
    if (!graphic && placed) {
      if ((t === "FRAME" || t === "COMPONENT") && (!n.layoutMode || n.layoutMode === "NONE")) hit("layout.none", n, kids.length > 1 ? `${kids.length} layers placed by hand` : `${kids[0].name} placed by hand at ${+kids[0].x.toFixed(2)}, ${+kids[0].y.toFixed(2)}`);
      if (t === "GROUP") hit("layout.group", n, `${kids.length} layers`);
    };
    absolute(n, parent);
    if (t === "COMPONENT_SET" && (n.children || []).length > 1 && (!n.layoutMode || n.layoutMode === "NONE")) hit("set.layout", n, `${n.children.length} variants placed by hand`);
    fixedSize(n, parent, where);
    if (where === "screen" && t !== "TEXT") {
      const manual = !parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning === "ABSOLUTE";
      const fixedW = n.layoutSizingHorizontal === void 0 || n.layoutSizingHorizontal === "FIXED";
      const fixedH = n.layoutSizingVertical === void 0 || n.layoutSizingVertical === "FIXED";
      const off = [manual && frac(n.x) ? `x ${+n.x.toFixed(2)}` : "", manual && frac(n.y) ? `y ${+n.y.toFixed(2)}` : "", fixedW && frac(n.width) ? `width ${+n.width.toFixed(2)}` : "", fixedH && frac(n.height) ? `height ${+n.height.toFixed(2)}` : ""].filter(Boolean);
      if (off.length && parent) hit("geometry.subpixel", n, off.join(", "));
    };
    if (graphic) return;
    const inside = t === "COMPONENT_SET" || t === "COMPONENT" ? owners.concat(own) : owners;
    for (const c of n.children || []) visit(c, where, n, inside);
  };
  const components = (n) => n.type === "COMPONENT_SET" || n.type === "COMPONENT" ? [n] : n.type === "INSTANCE" ? [] : [].concat(...(n.children || []).map(components));
  const SCREEN_NAME = /^[\p{L}][\p{L}\p{N}'’&+ -]*$/u;
  const screenSlugs = {};
  const checkScreenName = (n) => {
    const name = String(n.name).trim();
    const words = name.split(/\s+/).filter(Boolean);
    if (!SCREEN_NAME.test(name) || name.length > 40 || words.length > 6 || /\d{3,}$/.test(name)) {
      hit("screen.name", n, `"${name}"`);
      return;
    };
    const slug = name.toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    if (screenSlugs[slug]) hit("screen.name", n, `"${name}" and "${screenSlugs[slug]}" are the same screen name`);
    else screenSlugs[slug] = name;
  };
  for (const r of roots) {
    const ds = !!facts.dsPage && pageOf(r) === facts.dsPage;
    const tops = ds ? components(r) : r.type === "PAGE" || r.type === "SECTION" ? (r.children || []).filter((c) => c.type === "FRAME" || c.type === "SECTION" || c.type === "COMPONENT_SET" || c.type === "COMPONENT") : [r];
    for (const c of tops) {
      if (c.type !== "SECTION") covers.push(c.id);
      else for (const k of c.children || []) covers.push(k.id);
      top = c.name;
      areas[c.name] = c.id;
      if (!ds && c.type === "FRAME") checkScreenName(c);
      if (!ds && c.type === "SECTION") {
        for (const k of c.children || []) if (k.type === "FRAME") checkScreenName(k);
      };
      visit(c, ds ? "ds" : "screen", null, []);
    }
  };
  return { hits, fonts: fonts.sort(), covers, areas };
  function pageOf(n) {
    let x = n;
    while (x && x.type !== "PAGE") x = x.parent;
    return x ? x.id : null;
  }
};
const { hits, fonts, covers, areas } = inspect(roots, { vars, defaultModes, textStyles, mains, componentNames, dsPage: ds });
const grouped = {};
for (const h of hits) {
  const g = grouped[h.rule] || (grouped[h.rule] = { count: 0, nodes: [] });
  g.count++;
  if (g.nodes.length < 200) g.nodes.push([h.node, h.name, h.detail, h.in]);
}
const s = JSON.stringify({ file: figma.fileKey || null, pages: [...new Set(roots.map(pageOf))], covers, areas, fonts, total: hits.length, hits: grouped });
const part = {{PART}};
const size = 15000;
return { checksum: checksum(s), length: s.length, parts: Math.ceil(s.length / size), part, data: s.slice(part * size, (part + 1) * size) };
```

## 4. Grade it

The report's `hits` maps each rule to its `count` and its `nodes`, each
`[node id, layer name, detail, area]` (the area is the component or screen it
is in). Give each rule its severity from this table. A rule not in it is
blocking. The gate **passes** only when no blocking rule has findings.

| Rule | Severity | What it is | How to fix it in Figma |
| --- | --- | --- | --- |
| `color.unbound` | blocking | Colour without a variable | Bind the fill or stroke to a colour variable. Wave only takes colours from tokens. |
| `color.stale` | blocking | Colour does not match its variable | The paint is bound to a variable but draws another colour. Re-apply the variable (detach and bind again) so the drawing and the token agree. |
| `variable.remote` | blocking | Variable from another file | The value is bound to a library variable this file does not define. Make the variable local, or publish the tokens from this file. |
| `spacing.unbound` | blocking | Spacing without a variable | Bind the gap or padding to a spacing variable. |
| `radius.unbound` | blocking | Corner radius without a variable | Bind the radius to a radius variable. |
| `stroke.unbound` | blocking | Stroke width without a variable | Bind the stroke width to a border-width variable. |
| `opacity.unbound` | blocking | Layer opacity without a variable | Bind the opacity to an opacity variable, or put the transparency in the colour variable. |
| `effect.unbound` | blocking | Shadow or blur without tokens | Use an effect style, or bind the effect's colour and sizes to variables. |
| `effect.under-stroke` | blocking | Inner shadow under an inside stroke | Figma draws the stroke over the inner shadow, a browser draws the shadow inside the border, so the two differ. Remove the inner shadow (when the stroke covers it, it shows nothing), or remove the stroke and let the shadow be the ring. |
| `text.style` | blocking | Text without a text style | Apply one of the file's text styles. |
| `layout.none` | blocking | Layers placed by hand | Use auto layout. Hand-placed layers become absolutely positioned HTML that does not reflow and does not match its component. |
| `layout.group` | blocking | Group | Replace the group with an auto layout frame. Groups place their layers absolutely. |
| `layout.absolute` | blocking | Absolute position with an offset | A layer placed at an offset becomes a pixel position. Let auto layout place it (alignment, padding bound to spacing variables); an overlay at 0,0 is fine. |
| `size.fixed` | blocking | Fixed size without a variable | Set the layer to Hug or Fill, or bind its width or height to a size variable. |
| `text.fixed` | blocking | Text with a fixed width | Set the text to Hug (auto width) or Fill its container. |
| `instance.boolean` | blocking | Boolean property away from its default | Wave's catalogue draws a component's variants, so an instance that shows or hides a layer with a boolean has a shape none of them is. Make the property a variant property and draw the variant. |
| `instance.resized` | blocking | Instance at another size than its component | Keep the instance at its component's size (Hug where the component hugs). For another size, give the component a variant or a size variable for it. |
| `set.layout` | blocking | Component set without auto layout | Give the component set auto layout with gap and padding bound to spacing variables. It becomes the specimen page's canvas. |
| `instance.detached` | blocking | Detached instance | A frame carries a component's name but is not an instance. Replace it with an instance of the component. |
| `instance.remote` | blocking | Component from another library | Wave's catalogue is this file's design-system page. Bring the component into it, or use the local one. |
| `instance.override` | blocking | Instance restyled | The instance overrides how the component looks. Make the look a variant of the component and use that variant; only text, visibility, swaps and component properties may change per instance. |
| `component.description` | blocking | Component without a description | Write what the component is for in its description. It becomes the catalogue entry. |
| `choice.state` | blocking | Choice without a chosen look | A radio, checkbox, chip, segment, toggle, tab or option needs a State variant property with a chosen value (Selected, Checked or On) and a not-chosen value (Default, Unchecked or Off), each drawn. The prototype shows the chosen look when it is picked; Wave does not invent it. |
| `select.open` | blocking | Select without an open state | Add a State value Open to the select's component set and draw it: the field as it looks open, with its menu. Without it the prototype has nothing to open, and Wave does not invent a menu. |
| `select.menu` | blocking | Select's open state without a usable menu | In the Open variant, put the options in a layer named Menu: at least two rows, each an instance of one option component whose State has Selected and Default. The prototype opens this menu and shows the chosen option with its Selected look. |
| `screen.name` | blocking | Screen frame not named as the screen | Name each screen's frame as the screen is called, in plain words (About you, Budget and timing): no numbers, sizes or separators like · — \| /. The name becomes the screen's id, and every test id on the screen starts with it. |
| `color.gradient` | advice | Gradient | Gradients cannot be tokens yet; they are copied as drawn. Use a solid colour variable if the gradient is not essential. |
| `text.mixed` | advice | Mixed text styles in one layer | Split the layer, or check that each run uses a text style; mixed runs become spans. |
| `instance.outside` | advice | Component outside the design-system page | Move the main component to the design-system page so it becomes a catalogue specimen. |
| `instance.recolor` | advice | Instance recoloured with variables | Fine for an icon taking its parent's colour. If the colour is a state of the component, make it a variant instead. |
| `geometry.subpixel` | advice | Fractional position or size | Snap to whole pixels. Browsers round fractions differently from Figma, which shows as a pixel difference. |
| `layer.hidden` | advice | Hidden layer | Hidden layers are dropped. Delete it, or make the hidden look a variant. |
| `layer.name` | advice | Default layer name | Name the layer for what it is; names become element names and help the semantic pass. |
| `proto.unlinked` | advice | Button without a prototype link | Add a prototype interaction so the prototype knows where it goes. |

## 5. Report

1. **PASS** or **FAIL**, then the blocking and advice counts, and what was
   checked: the report's `areas` (components and screens) and `fonts`.
2. **Changed since the last official gate**, when the project has one: what is
   fixed, what is still open, what is new (match layers by name; node ids can
   change between files).
3. **Blocking**, by rule: the rule's fix, then a table of area, layer, detail
   and a link `https://www.figma.com/design/<file key>/?node-id=<node id with : as ->`.
4. **Advice**: one line per rule with its count.

When the designer has fixed something and asks again, run step 3 again.

## When it passes

Tell the designer to send the engineer the Figma design link, the prototype
link and this result (PASS, 0 blocking, the `checksum`), so the engineer runs
the official gate on the same version.

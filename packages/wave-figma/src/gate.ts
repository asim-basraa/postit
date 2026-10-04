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
  mains: Record<string, { name: string; remote: boolean; page: string | null; width?: number; height?: number; hugW?: boolean; hugH?: boolean; bools?: Record<string, boolean>; /** Its component set's State options. */ states?: string[] }>;
  /** Names of the file's local components and component sets. */
  componentNames: string[];
  /** The design-system page, when the file has one. */
  dsPage: string | null;
};

/** A finding: the rule, the layer, what is wrong, and the screen or component it is in. */
export type GateHit = { rule: string; node: string; name: string; detail?: string; in?: string };

/** What the rules found, the font families the checked text uses, and the frames and components they checked. */
export type GateInspection = { hits: GateHit[]; fonts: string[]; covers: string[]; areas: Record<string, string> };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function inspectNodes(roots: any[], facts: GateFacts): GateInspection {
  const hits: GateHit[] = [];
  const fonts: string[] = [];
  const covers: string[] = [];
  // Each component set, component or screen frame a finding can be in, by name, so a report can link it.
  const areas: Record<string, string> = {};
  let top = "";
  const hit = (rule: string, n: any, detail?: string) => hits.push({ rule, node: n.id, name: n.name, detail: detail || "", in: top });
  const vars = facts.vars;
  const all = Object.keys(vars).map((k) => vars[k]);
  const has = (type: string, scope: string) => all.some((v) => v.type === type && (v.scopes.indexOf(scope) >= 0 || v.scopes.indexOf("ALL_SCOPES") >= 0));
  const colorVars = all.some((v) => v.type === "COLOR");
  const scoped = { size: has("FLOAT", "WIDTH_HEIGHT"), gap: has("FLOAT", "GAP"), radius: has("FLOAT", "CORNER_RADIUS"), stroke: has("FLOAT", "STROKE_FLOAT"), opacity: has("FLOAT", "OPACITY"), effect: has("FLOAT", "EFFECT_FLOAT"), fontSize: has("FLOAT", "FONT_SIZE") };
  const names = facts.componentNames.map((s) => s.toLowerCase());
  const GRAPHIC = ["VECTOR", "BOOLEAN_OPERATION", "ELLIPSE", "RECTANGLE", "LINE", "STAR", "POLYGON"];
  const STYLE_FIELDS = ["fills", "strokes", "strokeWeight", "strokeAlign", "effects", "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "opacity", "fontSize", "fontName", "lineHeight", "letterSpacing", "textCase", "textDecoration", "textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId", "itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "layoutMode", "boundVariables"];
  const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Component|Instance|Auto layout|Section)( \d+)?$/;
  const mixed = (v: any) => typeof v === "symbol";
  const hex = (c: any) => "#" + [c.r, c.g, c.b].map((x: number) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  const frac = (x: any) => typeof x === "number" && Math.abs(x - Math.round(x)) > 0.01;

  const resolve = (id: string, n: any, depth: number): any => {
    const v = vars[id];
    if (!v || depth > 8) return null;
    const modes = (n && n.resolvedVariableModes) || {};
    const mode = modes[v.collection] || facts.defaultModes[v.collection];
    const val = mode in v.values ? v.values[mode] : v.values[Object.keys(v.values)[0]];
    return val && (val as any).type === "VARIABLE_ALIAS" ? resolve((val as any).id, n, depth + 1) : val;
  };

  const paints = (n: any, key: "fills" | "strokes") => {
    const list = n[key];
    if (mixed(list) || !Array.isArray(list)) return;
    for (const p of list) {
      if (p.visible === false || p.opacity === 0) continue;
      if (p.type !== "SOLID") {
        if (/^GRADIENT/.test(p.type)) hit("color.gradient", n, key);
        continue;
      }
      const b = p.boundVariables && p.boundVariables.color;
      if (!b) {
        if (colorVars) hit("color.unbound", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}${p.opacity !== undefined && p.opacity < 1 ? ` at ${Math.round(p.opacity * 100)}%` : ""}`);
        continue;
      }
      if (!vars[b.id]) {
        hit("variable.remote", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}`);
        continue;
      }
      const val = resolve(b.id, n, 0);
      if (val && typeof val === "object" && "r" in val) {
        const off = Math.max(Math.abs(val.r - p.color.r), Math.abs(val.g - p.color.g), Math.abs(val.b - p.color.b), Math.abs((val.a === undefined ? 1 : val.a) - (p.opacity === undefined ? 1 : p.opacity)));
        if (off > 1.5 / 255) hit("color.stale", n, `${key === "fills" ? "fill" : "stroke"} draws ${hex(p.color)}, its variable ${vars[b.id].name} is ${hex(val)}`);
      }
    }
  };

  const number = (n: any, key: string, on: boolean, rule: string, label: string, idle: number) => {
    if (!on) return;
    const v = n[key];
    if (typeof v !== "number" || v === idle) return;
    const b = n.boundVariables && n.boundVariables[key];
    if (!b) hit(rule, n, `${label} ${+v.toFixed(2)}`);
    else if (!vars[b.id]) hit("variable.remote", n, label);
  };

  // Figma binds a radius per corner and a stroke width per side.
  const CORNERS = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  const SIDES = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
  const perSide = (n: any, keys: string[], whole: string, on: boolean, rule: string, label: string) => {
    if (!on) return;
    const b = n.boundVariables || {};
    const loose: string[] = [];
    for (const k of keys) {
      const v = mixed(n[whole]) || n[whole] === undefined ? n[k] : n[whole];
      if (typeof v !== "number" || v === 0) continue;
      const bk = b[k] || b[whole];
      if (!bk) loose.push(String(+v.toFixed(2)));
      else if (!vars[bk.id]) hit("variable.remote", n, label);
    }
    if (loose.length) hit(rule, n, `${label} ${[...new Set(loose)].join("/")}`);
  };

  const find = (n: any, id: string): any => {
    if (n.id === id) return n;
    for (const c of n.children || []) {
      const f = find(c, id);
      if (f) return f;
    }
    return null;
  };
  const boundPaints = (n: any) => !!n && ["fills", "strokes"].every((k) => !Array.isArray(n[k]) || n[k].every((p: any) => p.visible === false || p.type !== "SOLID" || (p.boundVariables && p.boundVariables.color)));

  const effects = (n: any) => {
    const list = n.effects;
    if (!Array.isArray(list) || !list.some((e: any) => e.visible !== false)) return;
    if (typeof n.effectStyleId === "string" && n.effectStyleId) return;
    for (const e of list) {
      if (e.visible === false) continue;
      const b = e.boundVariables || {};
      const loose: string[] = [];
      if (e.color && colorVars && !b.color) loose.push(`color ${hex(e.color)}`);
      if (scoped.effect) for (const k of ["radius", "spread", "offsetX", "offsetY"]) {
        const v = k === "offsetX" ? e.offset && e.offset.x : k === "offsetY" ? e.offset && e.offset.y : e[k];
        if (typeof v === "number" && v !== 0 && !b[k]) loose.push(`${k} ${v}`);
      }
      if (loose.length) hit("effect.unbound", n, `${e.type.toLowerCase().replace("_", " ")}: ${loose.join(", ")}`);
    }
  };

  // An absolutely placed layer with an offset becomes a px position. At 0,0 (an overlay) it does not.
  const absolute = (n: any, parent: any) => {
    if (!parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning !== "ABSOLUTE") return;
    if (Math.abs(n.x) > 0.01 || Math.abs(n.y) > 0.01) hit("layout.absolute", n, `at ${+n.x.toFixed(2)}, ${+n.y.toFixed(2)}`);
  };

  // A fixed width or height becomes a px size unless it is a size variable. Hug and Fill do not.
  // A screen's own frame is the device, not the design, and is left to the converter.
  const fixedSize = (n: any, parent: any, where: string) => {
    if (!scoped.size || (!parent && where === "screen") || n.type === "COMPONENT_SET") return;
    const b = n.boundVariables || {};
    const loose: string[] = [];
    const text = n.type === "TEXT";
    for (const [axis, sizing, size] of [["width", n.layoutSizingHorizontal, n.width], ["height", n.layoutSizingVertical, n.height]] as [string, string, number][]) {
      if (sizing === "HUG" || sizing === "FILL" || !(size > 0)) continue;
      if (text && (n.textAutoResize === "WIDTH_AND_HEIGHT" || (axis === "height" && n.textAutoResize === "HEIGHT"))) continue;
      if (b[axis]) continue;
      loose.push(`${axis} ${+size.toFixed(2)}`);
    }
    if (loose.length) hit(text ? "text.fixed" : "size.fixed", n, loose.join(", "));
  };

  /** Whether another variant of n's component set shows the layer at the same place (by layer names). */
  const shownByVariant = (n: any): boolean => {
    const path: string[] = [];
    let v = n;
    while (v && !(v.type === "COMPONENT" && v.parent && v.parent.type === "COMPONENT_SET")) {
      path.unshift(v.name);
      v = v.parent;
    }
    if (!v) return false;
    return (v.parent.children || []).some((other: any) => {
      if (other === v) return false;
      let at = other;
      for (const name of path) {
        at = (at.children || []).find((c: any) => c.name === name);
        if (!at) return false;
      }
      return at.visible !== false;
    });
  };

  // What a prototype needs to play a component, drawn in Figma: a choice's chosen look, and a
  // select's open menu. Wave never invents either; a component without them fails the gate.
  // These names must stay in step with the prototype runtime's (wave-prototype/src/runtime.ts).
  const ON = /^(selected|checked|on|active|current)$/i;
  const OFF = /^(default|unchecked|unselected|off|inactive)$/i;
  const SELECT = /(^|[^a-z])(select|dropdown|drop-down|combo ?box|picker)([^a-z]|$)/i;
  const CHOICE = /(^|[^a-z])(radio|checkbox|check box|chip|segment item|toggle|switch|tab|option|option card|menu item)([^a-z]|$)/i;
  const CONTAINER = /(^|[^a-z])(group|bar|list|control|menu|tabs)$/i;
  const MENU = /^(menu|listbox|options)$/i;
  const stateOptions = (n: any): { key: string | null; options: string[] } => {
    const defs = n.componentPropertyDefinitions || {};
    const key = Object.keys(defs).find((k) => /^state$/i.test(k) && defs[k].type === "VARIANT") || null;
    return { key, options: key ? (defs[key].variantOptions || []).map(String) : [] };
  };
  const findMenu = (n: any): any => {
    for (const c of n.children || []) {
      if (c.visible === false) continue;
      if (MENU.test(String(c.name).trim())) return c;
      if (c.type !== "INSTANCE") {
        const f = findMenu(c);
        if (f) return f;
      }
    }
    return null;
  };
  const playable = (n: any) => {
    const name = String(n.name);
    const { key, options } = stateOptions(n);
    if (CHOICE.test(name) && !CONTAINER.test(name) && !SELECT.test(name)) {
      const on = options.filter((o) => ON.test(o));
      const off = options.filter((o) => OFF.test(o));
      if (!on.length || !off.length) hit("choice.state", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}; needs one chosen (Selected, Checked or On) and one not chosen (Default, Unchecked or Off)`);
    }
    if (!SELECT.test(name)) return;
    const open = options.find((o) => /^(open|expanded)$/i.test(o));
    if (!open) {
      hit("select.open", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}`);
      return;
    }
    const variant = (n.children || []).find((v: any) => v.variantProperties && v.variantProperties[key as string] === open);
    const menu = variant ? findMenu(variant) : null;
    if (!menu) {
      hit("select.menu", variant || n, `${name}: its ${open} variant has no layer named Menu`);
      return;
    }
    const rows = (menu.children || []).filter((c: any) => c.visible !== false);
    const bad = rows.filter((c: any) => {
      const m = c.type === "INSTANCE" ? facts.mains[c.id] : null;
      const st = (m && m.states) || [];
      return !m || !st.some((s: string) => ON.test(s)) || !st.some((s: string) => OFF.test(s));
    });
    if (rows.length < 2 || bad.length) hit("select.menu", menu, `${name}: Menu has ${rows.length} row${rows.length === 1 ? "" : "s"}${bad.length ? `, ${bad.length} not an instance of an option component with Selected and Default states` : ""}`);
  };

  const visit = (n: any, where: "screen" | "ds", parent: any, owners: string[]) => {
    const t = n.type;
    if (t === "SECTION") {
      for (const c of n.children || []) visit(c, where, null, owners);
      return;
    }
    if (n.visible === false) {
      // A layer a boolean component property shows and hides is the component's to toggle; one
      // another variant of the set shows (the Error variant's message) is that variant's look.
      if (!(n.componentPropertyReferences && n.componentPropertyReferences.visible) && !shownByVariant(n)) hit("layer.hidden", n);
      return;
    }
    if (t === "INSTANCE") {
      const m = facts.mains[n.id];
      if (m && m.remote) hit("instance.remote", n, m.name);
      else if (m && facts.dsPage && m.page && m.page !== facts.dsPage) hit("instance.outside", n, m.name);
      // Restyling an instance makes it differ from its component. Recolouring with colour
      // variables only (an icon taking its button's colour) is how Figma does currentColor.
      const styled: string[] = [];
      let recolor = true;
      for (const o of n.overrides || []) for (const f of o.overriddenFields || []) {
        if (STYLE_FIELDS.indexOf(f) < 0) continue;
        if (styled.indexOf(f) < 0) styled.push(f);
        if (!((f === "fills" || f === "strokes") && boundPaints(find(n, o.id)))) recolor = false;
      }
      if (styled.length) hit(recolor ? "instance.recolor" : "instance.override", n, `${m ? m.name : "instance"}: ${styled.join(", ")}`);
      if (where === "screen" && m && /button|link|cta/i.test(m.name) && !(n.reactions && n.reactions.length)) hit("proto.unlinked", n, m.name);
      // The component's own page may not be in this run: the instance says what its set has.
      if (where === "screen" && m && m.states) {
        if (SELECT.test(m.name) && !m.states.some((o) => /^(open|expanded)$/i.test(o))) hit("select.open", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
        else if (CHOICE.test(m.name) && !CONTAINER.test(m.name) && !SELECT.test(m.name) && !(m.states.some((o) => ON.test(o)) && m.states.some((o) => OFF.test(o)))) hit("choice.state", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
      }
      // Wave's catalogue draws variants: a boolean set away from its default shows a shape none of them is.
      if (m && m.bools) {
        const off: string[] = [];
        for (const k of Object.keys(m.bools)) {
          const p = n.componentProperties && n.componentProperties[k];
          if (p && p.value !== m.bools[k]) off.push(`${k.replace(/#.*$/, "")} ${p.value ? "on" : "off"}`);
        }
        if (off.length) hit("instance.boolean", n, `${m.name}: ${off.join(", ")}`);
      }
      if (m && m.width !== undefined) {
        // An instance keeps its component's size: it hugs where the component hugs, and is the
        // component's size where the component is fixed. Fill or a resize makes it another size.
        const off: string[] = [];
        for (const [axis, hug, size, own, sizing] of [["width", m.hugW, m.width, n.width, n.layoutSizingHorizontal], ["height", m.hugH, m.height, n.height, n.layoutSizingVertical]] as [string, boolean, number, number, string][]) {
          if (sizing === "FILL") off.push(`${axis} fills its parent`);
          else if (hug && sizing === "FIXED") off.push(`${axis} fixed at ${+own.toFixed(2)}, component hugs`);
          else if (!hug && Math.abs(own - size) > 0.5) off.push(`${axis} ${+own.toFixed(2)}, component ${+size.toFixed(2)}`);
        }
        if (off.length) hit("instance.resized", n, `${m.name}: ${off.join("; ")}`);
      }
      absolute(n, parent);
      return; // the inside of an instance is its component's, checked on the design-system page
    }
    const own = String(n.name).toLowerCase();
    if (t === "FRAME" && names.indexOf(own) >= 0 && owners.indexOf(own) < 0) hit("instance.detached", n, n.name);
    if ((t === "COMPONENT_SET" || (t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET"))) && !String(n.description || "").trim()) hit("component.description", n);
    if (t === "COMPONENT_SET" || (t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET"))) playable(n);
    if (t !== "TEXT" && t !== "COMPONENT_SET" && DEFAULT_NAME.test(n.name) && !(parent && parent.type === "COMPONENT_SET")) hit("layer.name", n);

    // A component set's frame (the purple outline, its radius) is Figma's, not the design's.
    if (t !== "COMPONENT_SET") {
      paints(n, "fills");
      paints(n, "strokes");
      const stroked = Array.isArray(n.strokes) && n.strokes.some((p: any) => p.visible !== false);
      if (stroked) perSide(n, SIDES, "strokeWeight", scoped.stroke, "stroke.unbound", "stroke width");
      if ((t !== "TEXT" && GRAPHIC.indexOf(t) < 0) || t === "RECTANGLE") perSide(n, CORNERS, "cornerRadius", scoped.radius, "radius.unbound", "radius");
      number(n, "opacity", scoped.opacity, "opacity.unbound", "opacity", 1);
      effects(n);
      // Figma draws an inside stroke over an inner shadow; a browser draws the shadow inside the border.
      if (stroked && n.strokeAlign === "INSIDE" && Array.isArray(n.effects) && n.effects.some((e: any) => e.visible !== false && e.type === "INNER_SHADOW")) hit("effect.under-stroke", n);
    }

    if (t === "TEXT") {
      const families = typeof n.getRangeAllFontNames === "function" && typeof n.characters === "string" ? n.getRangeAllFontNames(0, n.characters.length).map((f: any) => f.family) : n.fontName && !mixed(n.fontName) ? [n.fontName.family] : [];
      for (const f of families) if (fonts.indexOf(f) < 0) fonts.push(f);
      if (mixed(n.textStyleId) || mixed(n.fontName) || mixed(n.fontSize)) hit("text.mixed", n);
      else if (facts.textStyles > 0 ? !n.textStyleId : scoped.fontSize && !(n.boundVariables && n.boundVariables.fontSize)) hit("text.style", n, `${n.fontName ? n.fontName.family + " " + n.fontName.style : ""} ${n.fontSize}`.trim());
    }

    if (n.layoutMode && n.layoutMode !== "NONE") {
      number(n, "itemSpacing", scoped.gap, "spacing.unbound", "gap", 0);
      if (n.layoutWrap === "WRAP") number(n, "counterAxisSpacing", scoped.gap, "spacing.unbound", "row gap", 0);
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) number(n, k, scoped.gap, "spacing.unbound", k.replace("padding", "padding ").toLowerCase(), 0);
    }

    const kids = (n.children || []).filter((c: any) => c.visible !== false);
    // Shapes with a vector among them are exported as one SVG. Rectangles and ellipses alone are
    // drawn as boxes by Figma's code, so where they sit becomes a px position: they need a layout.
    const graphic = kids.length > 0 && kids.every((c: any) => GRAPHIC.indexOf(c.type) >= 0) && kids.some((c: any) => c.type !== "RECTANGLE" && c.type !== "ELLIPSE");
    const placed = kids.length > 1 || (kids.length === 1 && (Math.abs(kids[0].x) > 0.01 || Math.abs(kids[0].y) > 0.01));
    if (!graphic && placed) {
      if ((t === "FRAME" || t === "COMPONENT") && (!n.layoutMode || n.layoutMode === "NONE")) hit("layout.none", n, kids.length > 1 ? `${kids.length} layers placed by hand` : `${kids[0].name} placed by hand at ${+kids[0].x.toFixed(2)}, ${+kids[0].y.toFixed(2)}`);
      if (t === "GROUP") hit("layout.group", n, `${kids.length} layers`);
    }
    absolute(n, parent);
    if (t === "COMPONENT_SET" && (n.children || []).length > 1 && (!n.layoutMode || n.layoutMode === "NONE")) hit("set.layout", n, `${n.children.length} variants placed by hand`);
    fixedSize(n, parent, where);
    if (where === "screen" && t !== "TEXT") {
      const manual = !parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning === "ABSOLUTE";
      const fixedW = n.layoutSizingHorizontal === undefined || n.layoutSizingHorizontal === "FIXED";
      const fixedH = n.layoutSizingVertical === undefined || n.layoutSizingVertical === "FIXED";
      const off = [manual && frac(n.x) ? `x ${+n.x.toFixed(2)}` : "", manual && frac(n.y) ? `y ${+n.y.toFixed(2)}` : "", fixedW && frac(n.width) ? `width ${+n.width.toFixed(2)}` : "", fixedH && frac(n.height) ? `height ${+n.height.toFixed(2)}` : ""].filter(Boolean);
      if (off.length && parent) hit("geometry.subpixel", n, off.join(", "));
    }
    if (graphic) return; // an icon or illustration: exported as one SVG
    const inside = t === "COMPONENT_SET" || t === "COMPONENT" ? owners.concat(own) : owners;
    for (const c of n.children || []) visit(c, where, n, inside);
  };

  // On the design-system page only components are Wave's (labels and notes around them are not);
  // on other pages, every top-level frame is a screen.
  const components = (n: any): any[] => (n.type === "COMPONENT_SET" || n.type === "COMPONENT" ? [n] : n.type === "INSTANCE" ? [] : [].concat(...(n.children || []).map(components)));
  // A screen frame's name is the screen's name: its slug starts every test id on the screen.
  const SCREEN_NAME = /^[\p{L}][\p{L}\p{N}'’&+ -]*$/u;
  const screenSlugs: Record<string, string> = {};
  const checkScreenName = (n: any) => {
    const name = String(n.name).trim();
    const words = name.split(/\s+/).filter(Boolean);
    if (!SCREEN_NAME.test(name) || name.length > 40 || words.length > 6 || /\d{3,}$/.test(name)) {
      hit("screen.name", n, `"${name}"`);
      return;
    }
    const slug = name.toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    if (screenSlugs[slug]) hit("screen.name", n, `"${name}" and "${screenSlugs[slug]}" are the same screen name`);
    else screenSlugs[slug] = name;
  };
  for (const r of roots) {
    const ds = !!facts.dsPage && pageOf(r) === facts.dsPage;
    const tops = ds ? components(r) : r.type === "PAGE" || r.type === "SECTION" ? (r.children || []).filter((c: any) => c.type === "FRAME" || c.type === "SECTION" || c.type === "COMPONENT_SET" || c.type === "COMPONENT") : [r];
    for (const c of tops) {
      if (c.type !== "SECTION") covers.push(c.id);
      else for (const k of c.children || []) covers.push(k.id);
      top = c.name;
      areas[c.name] = c.id;
      if (!ds && c.type === "FRAME") checkScreenName(c);
      if (!ds && c.type === "SECTION") for (const k of c.children || []) if (k.type === "FRAME") checkScreenName(k);
      visit(c, ds ? "ds" : "screen", null, []);
    }
  }
  return { hits, fonts: fonts.sort(), covers, areas };

  function pageOf(n: any): string | null {
    let x = n;
    while (x && x.type !== "PAGE") x = x.parent;
    return x ? x.id : null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type GateSeverity = "blocking" | "advice";

/** Every rule: how much it matters, what it is, and what to do in Figma. */
export const GATE_RULES: Record<string, { severity: GateSeverity; title: string; fix: string }> = {
  "color.unbound": { severity: "blocking", title: "Colour without a variable", fix: "Bind the fill or stroke to a colour variable. Wave only takes colours from tokens." },
  "color.stale": { severity: "blocking", title: "Colour does not match its variable", fix: "The paint is bound to a variable but draws another colour. Re-apply the variable (detach and bind again) so the drawing and the token agree." },
  "color.gradient": { severity: "advice", title: "Gradient", fix: "Gradients cannot be tokens yet; they are copied as drawn. Use a solid colour variable if the gradient is not essential." },
  "variable.remote": { severity: "blocking", title: "Variable from another file", fix: "The value is bound to a library variable this file does not define. Make the variable local, or publish the tokens from this file." },
  "spacing.unbound": { severity: "blocking", title: "Spacing without a variable", fix: "Bind the gap or padding to a spacing variable." },
  "radius.unbound": { severity: "blocking", title: "Corner radius without a variable", fix: "Bind the radius to a radius variable." },
  "stroke.unbound": { severity: "blocking", title: "Stroke width without a variable", fix: "Bind the stroke width to a border-width variable." },
  "opacity.unbound": { severity: "blocking", title: "Layer opacity without a variable", fix: "Bind the opacity to an opacity variable, or put the transparency in the colour variable." },
  "effect.unbound": { severity: "blocking", title: "Shadow or blur without tokens", fix: "Use an effect style, or bind the effect's colour and sizes to variables." },
  "effect.under-stroke": { severity: "blocking", title: "Inner shadow under an inside stroke", fix: "Figma draws the stroke over the inner shadow, a browser draws the shadow inside the border, so the two differ. Remove the inner shadow (when the stroke covers it, it shows nothing), or remove the stroke and let the shadow be the ring." },
  "text.style": { severity: "blocking", title: "Text without a text style", fix: "Apply one of the file's text styles." },
  "text.mixed": { severity: "advice", title: "Mixed text styles in one layer", fix: "Split the layer, or check that each run uses a text style; mixed runs become spans." },
  "layout.none": { severity: "blocking", title: "Layers placed by hand", fix: "Use auto layout. Hand-placed layers become absolutely positioned HTML that does not reflow and does not match its component." },
  "layout.group": { severity: "blocking", title: "Group", fix: "Replace the group with an auto layout frame. Groups place their layers absolutely." },
  "layout.absolute": { severity: "blocking", title: "Absolute position with an offset", fix: "A layer placed at an offset becomes a pixel position. Let auto layout place it (alignment, padding bound to spacing variables); an overlay at 0,0 is fine." },
  "size.fixed": { severity: "blocking", title: "Fixed size without a variable", fix: "Set the layer to Hug or Fill, or bind its width or height to a size variable." },
  "text.fixed": { severity: "blocking", title: "Text with a fixed width", fix: "Set the text to Hug (auto width) or Fill its container." },
  "instance.boolean": { severity: "blocking", title: "Boolean property away from its default", fix: "Wave's catalogue draws a component's variants, so an instance that shows or hides a layer with a boolean has a shape none of them is. Make the property a variant property and draw the variant." },
  "instance.resized": { severity: "blocking", title: "Instance at another size than its component", fix: "Keep the instance at its component's size (Hug where the component hugs). For another size, give the component a variant or a size variable for it." },
  "set.layout": { severity: "blocking", title: "Component set without auto layout", fix: "Give the component set auto layout with gap and padding bound to spacing variables. It becomes the specimen page's canvas." },
  "instance.detached": { severity: "blocking", title: "Detached instance", fix: "A frame carries a component's name but is not an instance. Replace it with an instance of the component." },
  "instance.remote": { severity: "blocking", title: "Component from another library", fix: "Wave's catalogue is this file's design-system page. Bring the component into it, or use the local one." },
  "instance.outside": { severity: "advice", title: "Component outside the design-system page", fix: "Move the main component to the design-system page so it becomes a catalogue specimen." },
  "instance.recolor": { severity: "advice", title: "Instance recoloured with variables", fix: "Fine for an icon taking its parent's colour. If the colour is a state of the component, make it a variant instead." },
  "instance.override": { severity: "blocking", title: "Instance restyled", fix: "The instance overrides how the component looks. Make the look a variant of the component and use that variant; only text, visibility, swaps and component properties may change per instance." },
  "component.description": { severity: "blocking", title: "Component without a description", fix: "Write what the component is for in its description. It becomes the catalogue entry." },
  "geometry.subpixel": { severity: "advice", title: "Fractional position or size", fix: "Snap to whole pixels. Browsers round fractions differently from Figma, which shows as a pixel difference." },
  "layer.hidden": { severity: "advice", title: "Hidden layer", fix: "Hidden layers are dropped. Delete it, or make the hidden look a variant." },
  "layer.name": { severity: "advice", title: "Default layer name", fix: "Name the layer for what it is; names become element names and help the semantic pass." },
  "choice.state": { severity: "blocking", title: "Choice without a chosen look", fix: "A radio, checkbox, chip, segment, toggle, tab or option needs a State variant property with a chosen value (Selected, Checked or On) and a not-chosen value (Default, Unchecked or Off), each drawn. The prototype shows the chosen look when it is picked; Wave does not invent it." },
  "select.open": { severity: "blocking", title: "Select without an open state", fix: "Add a State value Open to the select's component set and draw it: the field as it looks open, with its menu. Without it the prototype has nothing to open, and Wave does not invent a menu." },
  "select.menu": { severity: "blocking", title: "Select's open state without a usable menu", fix: "In the Open variant, put the options in a layer named Menu: at least two rows, each an instance of one option component whose State has Selected and Default. The prototype opens this menu and shows the chosen option with its Selected look." },
  "screen.name": { severity: "blocking", title: "Screen frame not named as the screen", fix: "Name each screen's frame as the screen is called, in plain words (About you, Budget and timing): no numbers, sizes or separators like · — | /. The name becomes the screen's id, and every test id on the screen starts with it." },
  "proto.unlinked": { severity: "advice", title: "Button without a prototype link", fix: "Add a prototype interaction so the prototype knows where it goes." },
};

export type GateReport = {
  file: string | null;
  pages: string[];
  covers: string[];
  /** The component sets, components and screen frames findings are in, by name: their node ids. */
  areas?: Record<string, string>;
  fonts: string[];
  total: number;
  hits: Record<string, { count: number; nodes: [string, string, string?, string?][] }>;
};

export type GateResult = { pass: boolean; blocking: number; advice: number; rules: { rule: string; severity: GateSeverity; title: string; fix: string; count: number; nodes: [string, string, string?, string?][] }[] };

export function evaluateGate(report: GateReport): GateResult {
  const rules = Object.entries(report.hits)
    .map(([rule, h]) => ({ rule, ...(GATE_RULES[rule] ?? { severity: "blocking" as const, title: rule, fix: "" }), count: h.count, nodes: h.nodes }))
    .sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "blocking" ? -1 : 1));
  const blocking = rules.filter((r) => r.severity === "blocking").reduce((s, r) => s + r.count, 0);
  const advice = rules.filter((r) => r.severity === "advice").reduce((s, r) => s + r.count, 0);
  return { pass: blocking === 0, blocking, advice, rules };
}

/** The gate's findings as Markdown for the designer, with a Figma link per layer. */
export function gateMarkdown(report: GateReport, result: GateResult, opts: { title?: string; fontsMissing?: string[] } = {}): string {
  const link = (id: string) => (report.file ? `https://www.figma.com/design/${report.file}/?node-id=${id.replace(":", "-")}` : null);
  const lines = [`# ${opts.title ?? "Figma entry gate"}`, ""];
  lines.push(result.pass ? `Passed. ${result.advice} advice item${result.advice === 1 ? "" : "s"} below.` : `Not passed: ${result.blocking} blocking item${result.blocking === 1 ? "" : "s"} to fix in Figma, ${result.advice} advice. Nothing is converted until the blocking items are fixed and the gate is run again.`);
  if (opts.fontsMissing?.length) lines.push("", `Fonts Google Fonts does not serve (send the font files): ${opts.fontsMissing.join(", ")}.`);
  for (const sev of ["blocking", "advice"] as const) {
    const rs = result.rules.filter((r) => r.severity === sev);
    if (!rs.length) continue;
    lines.push("", `## ${sev === "blocking" ? "Blocking" : "Advice"}`);
    for (const r of rs) {
      lines.push("", `### ${r.title} (${r.count})`, "", r.fix, "", "| In | Layer | Detail |", "|---|---|---|");
      for (const [id, name, detail, where] of r.nodes) {
        const l = link(id);
        const cell = (x: string | undefined) => (x ?? "").replace(/\|/g, "/");
        lines.push(`| ${cell(where)} | ${l ? `[${cell(name)}](${l})` : cell(name)} \`${id}\` | ${cell(detail)} |`);
      }
      if (r.count > r.nodes.length) lines.push(`| ... and ${r.count - r.nodes.length} more | | |`);
    }
  }
  return lines.join("\n") + "\n";
}

/** Whether a gate report that passed covers this node (a frame or component it checked). */
export function gateCovers(report: GateReport, node: string): boolean {
  return report.covers.includes(node);
}

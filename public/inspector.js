/*
 * Post-it mockup inspector.
 *
 * Injected into a mockup only when a signed-in reader opens it in review mode,
 * never on the public link. The mockup runs in a sandboxed frame with an opaque
 * origin, so Post-it cannot reach into its DOM: this script answers "what is
 * under the cursor", "what are this element's styles", "where is this comment"
 * from inside, and reports over postMessage. It draws its own overlay (outlines,
 * labels, pins) inside the frame, so nothing has to line coordinates up across
 * the frame boundary, whatever the zoom or scroll.
 *
 * The approach (the framed document reports ids and boxes, the host owns the
 * panel) and effectiveBox are ported from Lighter's preview SDK.
 *
 * Everything the page's own scripts could also send is treated as untrusted by
 * the host, so nothing here is a secret or an authority.
 */
(function () {
  "use strict";
  if (window.__piInspector) return;
  window.__piInspector = true;

  var PROTOCOL = 1;
  var ID = "data-pi-id";
  var parent = window.parent;
  var mode = "inspect";
  var hovered = null;
  var selected = null;
  var highlightedId = null;
  var pins = [];
  var diff = null;
  var boxLayer = null;
  var dragging = null;
  var previewing = null;

  function send(type, payload) {
    var msg = payload || {};
    msg.type = type;
    msg.protocol = PROTOCOL;
    try {
      parent.postMessage(msg, "*");
    } catch (e) {
      /* the host went away */
    }
  }

  // ---- overlay -------------------------------------------------------------

  var host = document.createElement("pi-overlay");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;contain:strict;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    ".box{position:fixed;box-sizing:border-box;pointer-events:none;border-radius:2px}" +
    ".hover{outline:2px solid #2563eb;background:rgba(37,99,235,.08)}" +
    ".hover.un{outline:2px dashed #9333ea;background:rgba(147,51,234,.06)}" +
    ".sel{outline:2px solid #ea580c;background:rgba(234,88,12,.06)}" +
    ".sel.un{outline-style:dashed}" +
    ".hl{outline:2px solid #16a34a;background:rgba(22,163,74,.1)}" +
    ".range{background:rgba(250,204,21,.45)}" +
    ".region{outline:2px dashed #0891b2;background:rgba(8,145,178,.08)}" +
    ".drag{outline:2px dashed #0891b2;background:rgba(8,145,178,.12)}" +
    ".added{outline:2px solid #16a34a}.changed{outline:2px solid #d97706}.removed{outline:2px solid #dc2626}" +
    ".m{background:rgba(249,115,22,.25)}.p{background:rgba(34,197,94,.25)}.c{background:rgba(59,130,246,.25)}.b{background:rgba(234,179,8,.3)}" +
    ".label{position:fixed;font:600 11px/1.4 system-ui,sans-serif;color:#fff;background:#2563eb;padding:1px 6px;border-radius:3px;white-space:nowrap;pointer-events:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis}" +
    ".label.un{background:#9333ea}.label.sel{background:#ea580c}" +
    ".pin{position:fixed;pointer-events:auto;cursor:pointer;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px 10px 10px 2px;font:700 11px/20px system-ui,sans-serif;text-align:center;color:#fff;background:#dc2626;box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-4px,-22px)}" +
    ".pin.addressed{background:#d97706}.pin.resolved{background:#16a34a}.pin.wont_fix{background:#6b7280}.pin.active{outline:2px solid #111;outline-offset:1px}" +
    "</style><div id=layer></div><div id=pins></div>";
  var layer = root.getElementById("layer");
  var pinLayer = root.getElementById("pins");

  var style = document.createElement("style");
  style.setAttribute("data-pi-inspector", "");
  style.textContent =
    "[data-pi-state-of]:not([data-pi-previewing]){display:none!important}" +
    "[data-pi-hidden-by-preview]{display:none!important}" +
    "html.pi-hide-conditional [data-pi-visible-if]{visibility:hidden!important}" +
    "html.pi-inspect, html.pi-inspect *{cursor:default!important}";

  function mount() {
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.appendChild(host);
    document.documentElement.classList.add("pi-inspect");
  }

  // ---- geometry ------------------------------------------------------------

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    if (r.width || r.height) return { top: r.top, left: r.left, width: r.width, height: r.height };
    var top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity, found = false;
    for (var i = 0; i < el.children.length; i++) {
      var b = rectOf(el.children[i]);
      if (!b) continue;
      found = true;
      top = Math.min(top, b.top);
      left = Math.min(left, b.left);
      right = Math.max(right, b.left + b.width);
      bottom = Math.max(bottom, b.top + b.height);
    }
    return found ? { top: top, left: left, width: right - left, height: bottom - top } : null;
  }

  function place(div, r) {
    div.style.top = r.top + "px";
    div.style.left = r.left + "px";
    div.style.width = r.width + "px";
    div.style.height = r.height + "px";
  }

  function byId(id) {
    if (!id) return null;
    try {
      return document.querySelector("[" + ID + '="' + CSS.escape(id) + '"]');
    } catch (e) {
      return null;
    }
  }

  var CONTROL = "a,button,input,select,textarea,[role=button],[role=link],[onclick]";

  /** What the reviewer is pointing at: the nearest node, or an unidentified control inside it. */
  function resolveTarget(target) {
    if (!(target instanceof Element) || target === host) return null;
    var node = target.closest("[" + ID + "]");
    var control = target.closest(CONTROL);
    if (control && !control.hasAttribute(ID) && (!node || node.contains(control))) {
      return { el: control, id: null };
    }
    if (node) return { el: node, id: node.getAttribute(ID) };
    if (target === document.documentElement || target === document.body) return null;
    return { el: target, id: null };
  }

  function labelFor(el) {
    var slug = el.getAttribute("data-pi-slug");
    var comp = el.getAttribute("data-pi-component");
    var id = el.getAttribute(ID);
    if (!id) return "unidentified <" + el.tagName.toLowerCase() + ">";
    return (slug || id) + (comp ? " · " + comp : "");
  }

  function ancestorsOf(el) {
    var chain = [];
    var cur = el.parentElement ? el.parentElement.closest("[" + ID + "]") : null;
    while (cur) {
      chain.unshift(cur.getAttribute(ID));
      cur = cur.parentElement ? cur.parentElement.closest("[" + ID + "]") : null;
    }
    return chain;
  }

  function selectorFor(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (cur.hasAttribute(ID)) {
        parts.unshift("[" + ID + '="' + cur.getAttribute(ID) + '"]');
        break;
      }
      var tag = cur.tagName.toLowerCase();
      var idx = 1;
      var sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) idx++;
      parts.unshift(tag + ":nth-of-type(" + idx + ")");
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function fingerprint(el) {
    var anc = el.parentElement ? el.parentElement.closest("[" + ID + "]") : null;
    return {
      tag: el.tagName.toLowerCase(),
      classes: (el.getAttribute("class") || "").slice(0, 200),
      text: (el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 200),
      ancestor: anc ? anc.getAttribute(ID) : null,
    };
  }

  function findByFingerprint(fp) {
    var scope = (fp.ancestor && byId(fp.ancestor)) || document;
    var list = scope.querySelectorAll(fp.tag);
    for (var i = 0; i < list.length; i++) {
      var f = fingerprint(list[i]);
      if (f.text === fp.text && f.classes === fp.classes) return list[i];
    }
    for (var j = 0; j < list.length; j++) if (fingerprint(list[j]).text === fp.text && fp.text) return list[j];
    return null;
  }

  // ---- drawing -------------------------------------------------------------

  function outline(el, cls, label) {
    var r = rectOf(el);
    if (!r) return;
    var d = document.createElement("div");
    d.className = "box " + cls;
    place(d, r);
    layer.appendChild(d);
    if (label) {
      var l = document.createElement("div");
      l.className = "label " + cls.replace("box", "");
      l.textContent = label;
      l.style.left = Math.max(0, r.left) + "px";
      l.style.top = (r.top > 18 ? r.top - 18 : r.top + r.height + 2) + "px";
      layer.appendChild(l);
    }
  }

  function rangeFor(el, start, end) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return p && (p.closest("script,style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT);
      },
    });
    var offset = 0, range = document.createRange(), started = false, n;
    while ((n = walker.nextNode())) {
      var len = n.data.length;
      if (!started && start <= offset + len) {
        range.setStart(n, start - offset);
        started = true;
      }
      if (started && end <= offset + len) {
        range.setEnd(n, end - offset);
        return range;
      }
      offset += len;
    }
    return null;
  }

  var transient = [];

  function draw() {
    layer.textContent = "";
    if (diff) {
      (diff.added || []).forEach(function (id) { var e = byId(id); if (e) outline(e, "added", null); });
      (diff.changed || []).forEach(function (id) { var e = byId(id); if (e) outline(e, "changed", null); });
      (diff.removed || []).forEach(function (id) { var e = byId(id); if (e) outline(e, "removed", null); });
    }
    if (selected && selected.el.isConnected) {
      outline(selected.el, "sel" + (selected.id ? "" : " un"), labelFor(selected.el));
      if (boxLayer) drawBox(selected.el, boxLayer);
    }
    if (highlightedId) {
      var h = byId(highlightedId);
      if (h) outline(h, "hl", labelFor(h));
    }
    if (hovered && mode === "inspect" && (!selected || hovered.el !== selected.el)) {
      outline(hovered.el, "hover" + (hovered.id ? "" : " un"), labelFor(hovered.el));
    }
    transient.forEach(function (t) {
      if (t.kind === "range") {
        var el = byId(t.pid);
        var range = el && rangeFor(el, t.start, t.end);
        if (range) {
          var rects = range.getClientRects();
          for (var i = 0; i < rects.length; i++) {
            var d = document.createElement("div");
            d.className = "box range";
            place(d, rects[i]);
            layer.appendChild(d);
          }
        }
      } else if (t.kind === "region") {
        var rd = document.createElement("div");
        rd.className = "box region";
        place(rd, { top: t.rect.y - window.scrollY, left: t.rect.x - window.scrollX, width: t.rect.w, height: t.rect.h });
        layer.appendChild(rd);
      }
    });
    if (dragging && dragging.moved) {
      var dd = document.createElement("div");
      dd.className = "box drag";
      place(dd, normRect(dragging));
      layer.appendChild(dd);
    }
    drawPins();
  }

  function drawBox(el, which) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    function n(p) { return parseFloat(cs.getPropertyValue(p)) || 0; }
    var m = { t: n("margin-top"), r: n("margin-right"), b: n("margin-bottom"), l: n("margin-left") };
    var bo = { t: n("border-top-width"), r: n("border-right-width"), b: n("border-bottom-width"), l: n("border-left-width") };
    var p = { t: n("padding-top"), r: n("padding-right"), b: n("padding-bottom"), l: n("padding-left") };
    var rect;
    if (which === "margin") rect = { top: r.top - m.t, left: r.left - m.l, width: r.width + m.l + m.r, height: r.height + m.t + m.b };
    else if (which === "border") rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    else if (which === "padding") rect = { top: r.top + bo.t, left: r.left + bo.l, width: r.width - bo.l - bo.r, height: r.height - bo.t - bo.b };
    else rect = { top: r.top + bo.t + p.t, left: r.left + bo.l + p.l, width: r.width - bo.l - bo.r - p.l - p.r, height: r.height - bo.t - bo.b - p.t - p.b };
    var d = document.createElement("div");
    d.className = "box " + ({ margin: "m", border: "b", padding: "p", content: "c" }[which] || "c");
    place(d, rect);
    layer.appendChild(d);
  }

  function anchorRect(a) {
    if (!a) return null;
    if (a.kind === "node") {
      var el = byId(a.pid);
      return el ? rectOf(el) : null;
    }
    if (a.kind === "range") {
      var host2 = byId(a.pid);
      var range = host2 && rangeFor(host2, a.start, a.end);
      if (range) {
        var rr = range.getBoundingClientRect();
        if (rr.width || rr.height) return { top: rr.top, left: rr.left, width: rr.width, height: rr.height };
      }
      return host2 ? rectOf(host2) : null;
    }
    if (a.kind === "region") {
      return { top: a.rect.y - window.scrollY, left: a.rect.x - window.scrollX, width: a.rect.w, height: a.rect.h };
    }
    if (a.kind === "element") {
      var found = null;
      try { found = document.querySelector(a.selector); } catch (e) { found = null; }
      if (found) {
        var fp = fingerprint(found);
        if (fp.tag !== a.fingerprint.tag || (a.fingerprint.text && fp.text !== a.fingerprint.text)) found = null;
      }
      if (!found) found = findByFingerprint(a.fingerprint);
      return found ? rectOf(found) : null;
    }
    return null;
  }

  var activePin = null;

  function drawPins() {
    pinLayer.textContent = "";
    var unresolved = [];
    pins.forEach(function (p) {
      var r = anchorRect(p.anchor);
      if (!r) {
        unresolved.push(p.commentId);
        return;
      }
      var b = document.createElement("div");
      b.className = "pin " + (p.status || "open") + (activePin === p.commentId ? " active" : "");
      b.textContent = String(p.n);
      b.title = p.title || "";
      b.style.left = Math.max(4, r.left) + "px";
      b.style.top = Math.max(22, r.top) + "px";
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        activePin = p.commentId;
        send("pi:pin-click", { commentId: p.commentId });
        draw();
      });
      pinLayer.appendChild(b);
    });
    var key = unresolved.join(",");
    if (key !== lastUnresolved) {
      lastUnresolved = key;
      send("pi:unresolved", { commentIds: unresolved });
    }
  }
  var lastUnresolved = null;

  var raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      draw();
    });
  }

  // ---- styles and tokens ---------------------------------------------------

  var GROUPS = {
    typography: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration-line"],
    color: ["color", "background-color", "background-image", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "opacity"],
    spacing: ["margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap"],
    size: ["width", "height", "min-width", "max-width", "min-height", "max-height"],
    border: ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    shadow: ["box-shadow"],
    layout: ["display", "position", "flex-direction", "flex-wrap", "justify-content", "align-items", "grid-template-columns", "overflow", "z-index"],
  };

  var SHORTHANDS = {
    "margin-top": ["margin", "margin-block", "margin-block-start"], "margin-bottom": ["margin", "margin-block", "margin-block-end"],
    "margin-left": ["margin", "margin-inline", "margin-inline-start"], "margin-right": ["margin", "margin-inline", "margin-inline-end"],
    "padding-top": ["padding", "padding-block", "padding-block-start"], "padding-bottom": ["padding", "padding-block", "padding-block-end"],
    "padding-left": ["padding", "padding-inline", "padding-inline-start"], "padding-right": ["padding", "padding-inline", "padding-inline-end"],
    "row-gap": ["gap"], "column-gap": ["gap"],
    "background-color": ["background"], "background-image": ["background"],
    "border-top-color": ["border-color", "border", "border-top"], "border-right-color": ["border-color", "border", "border-right"],
    "border-bottom-color": ["border-color", "border", "border-bottom"], "border-left-color": ["border-color", "border", "border-left"],
    "border-top-width": ["border-width", "border", "border-top"], "border-right-width": ["border-width", "border", "border-right"],
    "border-bottom-width": ["border-width", "border", "border-bottom"], "border-left-width": ["border-width", "border", "border-left"],
    "border-top-style": ["border-style", "border", "border-top"],
    "border-top-left-radius": ["border-radius"], "border-top-right-radius": ["border-radius"],
    "border-bottom-right-radius": ["border-radius"], "border-bottom-left-radius": ["border-radius"],
    "font-family": ["font"], "font-size": ["font"], "font-weight": ["font"], "line-height": ["font"],
  };

  var DEFAULTS = {
    "opacity": "1", "box-shadow": "none", "background-image": "none", "text-transform": "none", "text-decoration-line": "none",
    "position": "static", "overflow": "visible", "z-index": "auto", "flex-direction": "row", "flex-wrap": "nowrap",
    "justify-content": "normal", "align-items": "normal", "grid-template-columns": "none", "letter-spacing": "normal",
    "min-width": "auto", "min-height": "auto", "max-width": "none", "max-height": "none", "border-top-style": "none",
    "background-color": "rgba(0, 0, 0, 0)", "row-gap": "normal", "column-gap": "normal", "text-align": "start",
  };

  /** Declarations that apply to the element, in cascade-ish order (later wins). */
  function matchedDeclarations(el) {
    var out = [];
    var unreadable = 0;
    function walkRules(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.cssRules && !rule.selectorText) {
          if (rule.media && !window.matchMedia(rule.media.mediaText).matches) continue;
          walkRules(rule.cssRules);
          continue;
        }
        if (!rule.selectorText || !rule.style) continue;
        var ok = false;
        try { ok = el.matches(rule.selectorText); } catch (e) { ok = false; }
        if (ok) out.push(rule.style);
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s];
      if (sheet.ownerNode === style) continue;
      try {
        walkRules(sheet.cssRules);
      } catch (e) {
        unreadable++;
      }
    }
    if (el.style && el.style.length) out.push(el.style);
    return { list: out, unreadable: unreadable };
  }

  function varsIn(text) {
    var found = [];
    var re = /var\(\s*(--[\w-]+)/g;
    var m;
    while ((m = re.exec(text))) found.push(m[1]);
    return found;
  }

  function stylesOf(el) {
    var cs = getComputedStyle(el);
    var matched = matchedDeclarations(el);
    var groups = {};
    Object.keys(GROUPS).forEach(function (g) {
      groups[g] = GROUPS[g].map(function (prop) {
        var value = cs.getPropertyValue(prop).trim();
        var written = null;
        var names = [prop].concat(SHORTHANDS[prop] || []);
        for (var i = matched.list.length - 1; i >= 0 && written === null; i--) {
          for (var j = 0; j < names.length; j++) {
            var v = matched.list[i].getPropertyValue(names[j]);
            if (v) { written = v.trim(); break; }
          }
        }
        var vars = written ? varsIn(written) : [];
        return {
          prop: prop,
          value: value,
          written: written,
          vars: vars,
          isDefault: DEFAULTS[prop] !== undefined ? DEFAULTS[prop] === value : false,
        };
      });
    });
    function n(p) { return Math.round((parseFloat(cs.getPropertyValue(p)) || 0) * 10) / 10; }
    var r = el.getBoundingClientRect();
    var box = {
      margin: [n("margin-top"), n("margin-right"), n("margin-bottom"), n("margin-left")],
      border: [n("border-top-width"), n("border-right-width"), n("border-bottom-width"), n("border-left-width")],
      padding: [n("padding-top"), n("padding-right"), n("padding-bottom"), n("padding-left")],
      content: [
        Math.round((r.width - n("border-left-width") - n("border-right-width") - n("padding-left") - n("padding-right")) * 10) / 10,
        Math.round((r.height - n("border-top-width") - n("border-bottom-width") - n("padding-top") - n("padding-bottom")) * 10) / 10,
      ],
    };
    // Custom properties defined on :root, so the host can say which exist.
    var rootVars = {};
    var rcs = getComputedStyle(document.documentElement);
    for (var k = 0; k < rcs.length; k++) {
      var name = rcs[k];
      if (name.indexOf("--") === 0) rootVars[name] = rcs.getPropertyValue(name).trim();
    }
    return { groups: groups, box: box, unreadableSheets: matched.unreadable, rootVars: rootVars };
  }

  // ---- selection -----------------------------------------------------------

  function select(target, fromUser) {
    selected = target;
    boxLayer = null;
    draw();
    if (!target) {
      send("pi:select", { id: null });
      return;
    }
    if (target.id) {
      send("pi:select", { id: target.id, ancestors: ancestorsOf(target.el), fromUser: !!fromUser });
    } else {
      send("pi:select", {
        id: null,
        element: { selector: selectorFor(target.el), fingerprint: fingerprint(target.el) },
        ancestors: ancestorsOf(target.el),
        fromUser: !!fromUser,
      });
    }
  }

  function normRect(d) {
    var x1 = Math.min(d.x0, d.x1), y1 = Math.min(d.y0, d.y1);
    return { left: x1, top: y1, width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) };
  }

  function coveredIds(rect) {
    var out = [];
    var all = document.querySelectorAll("[" + ID + "]");
    for (var i = 0; i < all.length; i++) {
      var r = rectOf(all[i]);
      if (!r || !r.width || !r.height) continue;
      var ix = Math.max(0, Math.min(r.left + r.width, rect.left + rect.width) - Math.max(r.left, rect.left));
      var iy = Math.max(0, Math.min(r.top + r.height, rect.top + rect.height) - Math.max(r.top, rect.top));
      if ((ix * iy) / (r.width * r.height) > 0.5) {
        var id = all[i].getAttribute(ID);
        var anc = ancestorsOf(all[i]);
        if (!anc.some(function (a) { return out.indexOf(a) >= 0; })) out.push(id);
      }
    }
    return out.slice(0, 50);
  }

  function textOffsetWithin(el, container, offset) {
    var r = document.createRange();
    r.setStart(el, 0);
    try {
      r.setEnd(container, offset);
    } catch (e) {
      return -1;
    }
    var frag = r.cloneContents();
    frag.querySelectorAll && frag.querySelectorAll("script,style").forEach(function (n) { n.remove(); });
    return frag.textContent.length;
  }

  function reportSelectionRange() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    var range = sel.getRangeAt(0);
    var common = range.commonAncestorContainer;
    var el = (common.nodeType === 1 ? common : common.parentElement);
    el = el && el.closest("[" + ID + "]");
    if (!el) return false;
    var start = textOffsetWithin(el, range.startContainer, range.startOffset);
    var end = textOffsetWithin(el, range.endContainer, range.endOffset);
    var quote = range.toString();
    if (start < 0 || end <= start || !quote.trim()) return false;
    selected = { el: el, id: el.getAttribute(ID) };
    transient = [{ kind: "range", pid: selected.id, start: start, end: end }];
    draw();
    send("pi:range", { pid: selected.id, start: start, end: end, quote: quote.slice(0, 1000), ancestors: ancestorsOf(el) });
    return true;
  }

  // ---- events --------------------------------------------------------------

  document.addEventListener(
    "mousemove",
    function (e) {
      if (dragging) {
        dragging.x1 = e.clientX;
        dragging.y1 = e.clientY;
        if (Math.abs(dragging.x1 - dragging.x0) + Math.abs(dragging.y1 - dragging.y0) > 6) dragging.moved = true;
        schedule();
        return;
      }
      if (mode !== "inspect") return;
      var t = resolveTarget(e.target);
      if ((t && t.el) !== (hovered && hovered.el)) {
        hovered = t;
        send("pi:hover", { id: t ? t.id : null, label: t ? labelFor(t.el) : null });
        schedule();
      }
    },
    true,
  );

  document.addEventListener("mouseleave", function () {
    hovered = null;
    schedule();
  });

  document.addEventListener(
    "mousedown",
    function (e) {
      if (mode !== "inspect" || e.button !== 0) return;
      if (e.altKey || e.shiftKey) {
        e.preventDefault();
        dragging = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false };
      }
    },
    true,
  );

  document.addEventListener(
    "mouseup",
    function (e) {
      if (mode !== "inspect") return;
      if (dragging) {
        var d = dragging;
        dragging = null;
        if (d.moved) {
          e.preventDefault();
          var r = normRect(d);
          var rect = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
          transient = [{ kind: "region", rect: rect }];
          selected = null;
          draw();
          send("pi:region", { rect: rect, viewport: window.innerWidth, covered: coveredIds(r) });
          suppressClick = true;
          return;
        }
      }
      // A drag that selected words is a range, not a click.
      setTimeout(function () {
        reportSelectionRange();
      }, 0);
    },
    true,
  );

  var suppressClick = false;

  function inspectClick(e) {
    if (e.target === host) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    transient = [];
    select(resolveTarget(e.target), true);
  }

  document.addEventListener(
    "click",
    function (e) {
      if (mode === "inspect") return inspectClick(e);
      // Interact: the mockup behaves, except that a destination Post-it knows
      // about opens that screen in the viewer.
      var target = e.target instanceof Element ? e.target.closest("[data-pi-to]") : null;
      if (!target) return;
      var to = target.getAttribute("data-pi-to") || "";
      if (/^(screen|node|modal):/.test(to) || to === "back") {
        e.preventDefault();
        send("pi:navigate", { to: to, from: target.getAttribute(ID) });
      }
    },
    true,
  );

  ["submit", "dblclick", "auxclick", "contextmenu"].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        if (mode !== "inspect") return;
        if (type === "contextmenu") return;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  });

  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        send("pi:key", { key: "toggle-mode" });
        return;
      }
      if (mode !== "inspect") return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].indexOf(e.key) >= 0) {
        e.preventDefault();
        send("pi:key", { key: e.key });
      }
    },
    true,
  );

  window.addEventListener("scroll", function () {
    schedule();
    send("pi:scroll", { x: window.scrollX, y: window.scrollY });
  }, true);
  window.addEventListener("resize", schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.documentElement);

  // ---- commands from the host ---------------------------------------------

  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || typeof m !== "object" || typeof m.type !== "string") return;
    switch (m.type) {
      case "pi:mode":
        mode = m.mode === "interact" ? "interact" : "inspect";
        document.documentElement.classList.toggle("pi-inspect", mode === "inspect");
        hovered = null;
        draw();
        break;
      case "pi:select": {
        var el = byId(m.id);
        if (!el && m.element) {
          try { el = document.querySelector(m.element.selector); } catch (err) { el = null; }
          if (!el && m.element.fingerprint) el = findByFingerprint(m.element.fingerprint);
        }
        transient = [];
        if (el) {
          if (m.scroll !== false) el.scrollIntoView({ block: "nearest", inline: "nearest" });
          select({ el: el, id: el.getAttribute(ID) }, false);
        } else {
          select(null, false);
        }
        break;
      }
      case "pi:highlight":
        highlightedId = typeof m.id === "string" ? m.id : null;
        draw();
        break;
      case "pi:pins":
        pins = Array.isArray(m.pins) ? m.pins : [];
        activePin = typeof m.active === "string" ? m.active : null;
        lastUnresolved = null;
        draw();
        break;
      case "pi:show-anchor": {
        var a = m.anchor;
        transient = [];
        if (a && a.kind === "range") transient = [{ kind: "range", pid: a.pid, start: a.start, end: a.end }];
        if (a && a.kind === "region") {
          transient = [{ kind: "region", rect: a.rect }];
          window.scrollTo({ top: Math.max(0, a.rect.y - 80), behavior: "smooth" });
        }
        var r = anchorRect(a);
        if (r && a.kind !== "region" && (r.top < 0 || r.top > window.innerHeight)) {
          window.scrollBy({ top: r.top - 80, behavior: "smooth" });
        }
        activePin = typeof m.commentId === "string" ? m.commentId : activePin;
        draw();
        break;
      }
      case "pi:clear-transient":
        transient = [];
        draw();
        break;
      case "pi:get-styles": {
        var target = byId(m.id);
        if (!target && selected && !selected.id) target = selected.el;
        if (target) send("pi:styles", { id: m.id || null, styles: stylesOf(target) });
        break;
      }
      case "pi:box":
        boxLayer = typeof m.layer === "string" ? m.layer : null;
        draw();
        break;
      case "pi:preview-state": {
        if (previewing) {
          previewing.forEach(function (n) {
            n.removeAttribute("data-pi-previewing");
            n.removeAttribute("data-pi-hidden-by-preview");
          });
          previewing = null;
        }
        var base = byId(m.id);
        if (base && m.state) {
          var depictions = document.querySelectorAll('[data-pi-state-of="' + CSS.escape(m.id) + '"][data-pi-state="' + CSS.escape(m.state) + '"]');
          if (depictions.length) {
            previewing = [base];
            base.setAttribute("data-pi-hidden-by-preview", "");
            depictions.forEach(function (d) {
              d.setAttribute("data-pi-previewing", "");
              previewing.push(d);
            });
          }
        }
        draw();
        send("pi:state-previewed", { id: m.id || null, state: previewing ? m.state : null });
        break;
      }
      case "pi:hide-conditional":
        document.documentElement.classList.toggle("pi-hide-conditional", !!m.on);
        draw();
        break;
      case "pi:diff":
        diff = m.diff && typeof m.diff === "object" ? m.diff : null;
        draw();
        break;
      case "pi:scroll-to":
        window.scrollTo(Number(m.x) || 0, Number(m.y) || 0);
        break;
    }
  });

  function hello() {
    send("pi:hello", {
      capabilities: ["select", "range", "region", "styles", "pins", "states", "navigate", "diff"],
      title: document.title,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mount();
      hello();
    });
  } else {
    mount();
    hello();
  }
  window.addEventListener("load", schedule);
})();

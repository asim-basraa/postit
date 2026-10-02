import { describe, expect, it } from "vitest";
import { flattenTokens, matchValue } from "../src/tokens";

const doc = {
  color: {
    $type: "color",
    blue: { "600-a28": { $value: "#2F4BDB47" } },
    accent: { ring: { $value: "{color.blue.600-a28}" } },
  },
  dimension: { $type: "dimension", "3": { $value: { value: 0.1875, unit: "rem" } } },
  shadow: {
    spread: { ring: { $type: "dimension", $value: "{dimension.3}" } },
    "focus-ring": {
      $type: "shadow",
      $value: { color: "{color.accent.ring}", offsetX: { value: 0, unit: "rem" }, offsetY: { value: 0, unit: "rem" }, blur: { value: 0, unit: "rem" }, spread: "{shadow.spread.ring}" },
    },
  },
  font: { family: { geist: { $type: "fontFamily", $value: "Geist" } }, weight: { "600": { $type: "fontWeight", $value: 600 } } },
  type: { h1: { size: { $type: "dimension", $value: { value: 2.875, unit: "rem" } } } },
  typography: {
    h1: { $type: "typography", $value: { fontFamily: "{font.family.geist}", fontWeight: "{font.weight.600}", fontSize: "{type.h1.size}" } },
  },
  opacity: { disabled: { $type: "number", $value: 0.7 } },
  space: { tiny: { $type: "dimension", $value: { value: 0.7, unit: "px" } } },
};

describe("composite tokens", () => {
  const set = flattenTokens(doc);

  it("resolves references inside a shadow", () => {
    expect(set.byPath.get("shadow.focus-ring")?.value).toBe("0rem 0rem 0rem 0.1875rem #2F4BDB47");
  });

  it("resolves references inside a typography token", () => {
    expect(set.byPath.get("typography.h1")?.value).toBe("600 2.875rem Geist");
  });

  it("writes inset shadows, cubic-bezier easings and quoted family names", () => {
    const s = flattenTokens({
      a: { $type: "shadow", $value: { color: "#111113", offsetX: "0px", offsetY: "0px", blur: "0px", spread: "1px", inset: true } },
      e: { $type: "cubicBezier", $value: [0.2, 0, 0, 1] },
      t: { $type: "typography", $value: { fontFamily: "Geist Mono", fontWeight: 500, fontSize: "12px" } },
    });
    expect(s.byPath.get("a")?.value).toBe("inset 0px 0px 0px 1px #111113");
    expect(s.byPath.get("e")?.value).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(s.byPath.get("t")?.value).toBe('500 12px "Geist Mono"');
  });

  it("reports no problems for a well-formed file", () => {
    expect(set.problems).toEqual([]);
  });
});

describe("unitless tokens", () => {
  const set = flattenTokens(doc);

  it("normalises a number token as a number, not a length", () => {
    expect(set.byPath.get("opacity.disabled")?.normalised).toBe("num:0.7");
  });

  it("matches a bare literal to both a number token and a length token", () => {
    const paths = matchValue(set, "0.7").map((t) => t.path);
    expect(paths).toContain("opacity.disabled");
    expect(paths).toContain("space.tiny");
  });

  it("does not match a length literal to a number token", () => {
    expect(matchValue(set, "0.7px").map((t) => t.path)).toEqual(["space.tiny"]);
  });
});

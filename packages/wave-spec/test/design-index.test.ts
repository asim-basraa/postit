import { describe, expect, it } from "vitest";
import { designSystemIdsJson, designSystemPage, parseMockup, parseSpecimen, type IndexComponent } from "../src";

const button: IndexComponent = {
  name: "Button",
  type: "button",
  variants: ["primary", "ghost"],
  status: "approved",
  id: "DS.button",
  variantIds: { primary: "DS.primaryButton", ghost: "DS.ghostButton" },
  source: "figma:FILEKEY/28:197",
  page: "https://post.example/s/design/acme/design-system/components/button",
  review: "https://post.example/review/b1",
};
const textField: IndexComponent = { name: "Text field", type: "textInput", variants: ["default"], status: "proposed", id: null, variantIds: {} };

describe("design-system ids JSON", () => {
  it("lists every component with its id, type and variant ids, sorted by name", () => {
    const doc = designSystemIdsJson("Acme", [textField, button]);
    expect(doc.project).toBe("Acme");
    expect(doc.components).toEqual([
      { component: "Button", id: "DS.button", type: "button", variants: [{ variant: "primary", id: "DS.primaryButton" }, { variant: "ghost", id: "DS.ghostButton" }] },
      { component: "Text field", id: "DS.textField", type: "textInput", variants: [] },
    ]);
  });

  it("makes the ids when a specimen does not carry them", () => {
    const doc = designSystemIdsJson("Acme", [{ name: "Option card", type: "checkbox", variants: ["checkbox", "radio"], status: "approved" }]);
    expect(doc.components[0]).toEqual({
      component: "Option card",
      id: "DS.optionCard",
      type: "checkbox",
      variants: [
        { variant: "checkbox", id: "DS.checkboxOptionCard" },
        { variant: "radio", id: "DS.radioOptionCard" },
      ],
    });
  });

  it("has no Figma or view links", () => {
    expect(JSON.stringify(designSystemIdsJson("Acme", [button]))).not.toMatch(/figma|review|https?:/i);
  });
});

describe("design-system page", () => {
  const idsLink = "[[acme/design-system/design-system-ids|design-system-ids]]";

  it("writes the table, the status, the link to the JSON under the table, and how ids are made", () => {
    const md = designSystemPage("Acme", [textField, button], { idsLink });
    expect(md).toMatch(/^# Design system/);
    expect(md).toContain("Status: 1 approved; waiting for approval: Text field.");
    expect(md).toContain("| Component | ID | Variant IDs | Type | Figma | View |");
    expect(md).toContain("| Button | `DS.button` | `DS.primaryButton` (primary)<br>`DS.ghostButton` (ghost) | button | [28:197](https://www.figma.com/design/FILEKEY?node-id=28-197) | [Page](https://post.example/s/design/acme/design-system/components/button) · [Review](https://post.example/review/b1) |");
    expect(md).toContain("| Text field | `DS.textField` | none (one variant) | textInput |");
    const lines = md.split("\n");
    const lastRow = lines.findLastIndex((l) => l.startsWith("| "));
    expect(lines[lastRow + 2]).toBe(`The same table as JSON, without the Figma and View columns: ${idsLink}.`);
    expect(md).toContain("## How the ids are made");
  });

  it("leaves out the Figma and View columns when nothing has them", () => {
    const md = designSystemPage("Acme", [textField], { idsLink });
    expect(md).toContain("| Component | ID | Variant IDs | Type |\n");
    expect(md).not.toContain("Figma has no ids");
  });

  it("keeps the page's own opening and Notes, and regenerates the rest", () => {
    const previous = "# Design system\n\nOur own words about the system.\n\nStatus: all proposed, waiting for approval.\n\n| old | table |\n\n## Notes\n\n- Checkbox hover follows the variable.\n";
    const md = designSystemPage("Acme", [{ ...button, status: "approved" }], { idsLink, previous });
    expect(md.startsWith("# Design system\n\nOur own words about the system.\n\nStatus: all approved by the designer.")).toBe(true);
    expect(md).not.toContain("| old | table |");
    expect(md.trimEnd().endsWith("## Notes\n\n- Checkbox hover follows the variable.")).toBe(true);
  });
});

describe("specimen source", () => {
  it("reads where a specimen was drawn in Figma", () => {
    const html = `<!doctype html><html><head><meta name="figma-source" content="figma:KEY/28:291"><meta name="wave:spec" content="1"><meta name="wave:component" content="Radio">
<script type="application/wave-component+json" id="wave-component">{"description":"A radio.","type":"radio"}</script></head>
<body><span data-wave-id="n_radio1" data-wave-component="Radio"></span></body></html>`;
    expect(parseSpecimen(html, parseMockup(html))?.source).toBe("figma:KEY/28:291");
  });
});

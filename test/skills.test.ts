import { describe, test, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { parseFrontmatter } from "@postit/renderer";
import {
  folderName,
  layOutSkillset,
  skillsetArchive,
  type SkillRow,
} from "@/lib/skills";
import { tar, MAX_PATH } from "@/lib/tar";

function skill(partial: Partial<SkillRow> & { content: string }): SkillRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "A skill",
    slug: "a-skill",
    path: "a-skill",
    ...partial,
  };
}

describe("folder names", () => {
  test("follow the same rule as a node's slug", () => {
    expect(folderName("Monthly Invoicing")).toBe("monthly-invoicing");
    expect(folderName("  Spaced  Out  ")).toBe("spaced-out");
    expect(folderName("Ünicode & punctuation!")).toBe("nicode-punctuation");
  });

  test("never come back empty", () => {
    // Something has to name the folder, and "" would be an archive entry that
    // unpacks over its own parent.
    expect(folderName("!!!")).toBe("untitled");
    expect(folderName("")).toBe("untitled");
  });

  test("stay short enough for a tar header", () => {
    const folder = folderName("a".repeat(300));
    expect(folder.length).toBeLessThan(MAX_PATH - "/SKILL.md".length);
    // And the truncation must not leave a trailing hyphen, which would be an
    // odd-looking folder produced by an implementation detail.
    expect(folder.endsWith("-")).toBe(false);
  });
});

describe("laying out a skillset", () => {
  test("names the folder from the frontmatter, not the page", () => {
    // The standard says a skill's name and its folder must agree, and it is
    // the frontmatter an agent reads.
    const [laid] = layOutSkillset([
      skill({
        name: "Invoicing (v2, final)",
        content: "---\nname: monthly-invoicing\ndescription: Bills people\n---\n\nSteps.\n",
      }),
    ]);

    expect(laid.folder).toBe("monthly-invoicing");
    expect(laid.description).toBe("Bills people");
  });

  test("rewrites the name so it cannot disagree with the folder", () => {
    const [laid] = layOutSkillset([
      skill({
        content: "---\nname: Monthly Invoicing\ndescription: Bills people\n---\n\nSteps.\n",
      }),
    ]);

    expect(laid.folder).toBe("monthly-invoicing");
    expect(laid.file).toContain('name: "monthly-invoicing"');
  });

  test("falls back to the page's name when the frontmatter has none", () => {
    // Storage is forgiving about this on purpose; what goes out still has to
    // be a valid skill.
    const [laid] = layOutSkillset([
      skill({ name: "Rescue Plan", content: "No frontmatter at all.\n" }),
    ]);

    expect(laid.folder).toBe("rescue-plan");
    expect(laid.file).toContain('name: "rescue-plan"');
    expect(laid.file).toContain("No frontmatter at all.");
  });

  test("leaves a missing description missing rather than inventing one", () => {
    const [laid] = layOutSkillset([
      skill({ content: "---\nname: thing\n---\n\nBody.\n" }),
    ]);

    expect(laid.description).toBeNull();
    expect(laid.file).not.toContain("description:");
  });

  test("carries through frontmatter keys it does not recognise", () => {
    // The standard is open at the edges. Dropping a key we have not heard of
    // would quietly break skills written for something newer than this.
    const [laid] = layOutSkillset([
      skill({
        content:
          "---\nname: thing\ndescription: Does it\nlicense: MIT\nallowed-tools: Read, Bash\n---\n\nBody.\n",
      }),
    ]);

    expect(laid.file).toContain('license: "MIT"');
    expect(laid.file).toContain('allowed-tools: "Read, Bash"');
  });

  test("quotes values so punctuation cannot break the file", () => {
    const [laid] = layOutSkillset([
      skill({
        content:
          '---\nname: thing\ndescription: "Use when: you need a quote, a # hash"\n---\n\nBody.\n',
      }),
    ]);

    expect(laid.file).toContain(
      'description: "Use when: you need a quote, a # hash"',
    );
  });

  test("emits frontmatter its own parser reads back", () => {
    // The round trip is the check that matters: whatever quoting this chooses,
    // a reader has to get the same name and description out of it that went in.
    const [laid] = layOutSkillset([
      skill({
        content:
          '---\nname: thing\ndescription: "Awkward: a colon, a \'quote\', a # hash"\n---\n\nBody.\n',
      }),
    ]);

    const { data, body } = parseFrontmatter(laid.file);
    expect(data.name).toBe("thing");
    expect(data.description).toBe("Awkward: a colon, a 'quote', a # hash");
    expect(body.trim()).toBe("Body.");
  });

  test("suffixes a folder rather than losing a skill to a name clash", () => {
    const laid = layOutSkillset([
      skill({ id: "1", content: "---\nname: review\n---\n\nOne.\n" }),
      skill({ id: "2", content: "---\nname: Review\n---\n\nTwo.\n" }),
      skill({ id: "3", content: "---\nname: REVIEW\n---\n\nThree.\n" }),
    ]);

    expect(laid.map((s) => s.folder)).toEqual(["review", "review-2", "review-3"]);
  });
});

describe("the archive", () => {
  test("unpacks to a folder per skill, each holding a SKILL.md", () => {
    const entries = readTar(
      gunzipSync(
        skillsetArchive([
          skill({ id: "1", content: "---\nname: alpha\ndescription: A\n---\n\nOne.\n" }),
          skill({ id: "2", content: "---\nname: beta\ndescription: B\n---\n\nTwo.\n" }),
        ]),
      ),
    );

    expect(entries.map((e) => e.path)).toEqual([
      "alpha/",
      "alpha/SKILL.md",
      "beta/",
      "beta/SKILL.md",
    ]);
    expect(entries[1].body).toContain("One.");
    expect(entries[3].body).toContain('name: "beta"');
  });

  test("is byte-identical for the same skills twice", () => {
    // A timestamp of "now" in the header would make every fetch a new archive,
    // and a client could never tell whether anything had actually changed.
    const rows = [skill({ content: "---\nname: alpha\n---\n\nOne.\n" })];
    expect(skillsetArchive(rows).equals(skillsetArchive(rows))).toBe(true);
  });

  test("has a checksum every extractor will accept", () => {
    const block = tar([{ path: "a/SKILL.md", body: "hi" }]).subarray(512, 1024);

    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 0x20 : block[i];
    }

    expect(parseInt(block.toString("ascii", 148, 154), 8)).toBe(sum);
  });

  test("refuses a path too long for the format instead of truncating it", () => {
    expect(() => tar([{ path: `${"x".repeat(200)}/SKILL.md`, body: "" }])).toThrow(
      /too long/,
    );
  });
});

/** Just enough of a tar reader to check what the writer produced. */
function readTar(buffer: Buffer): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = [];

  for (let at = 0; at + 512 <= buffer.length; ) {
    const name = buffer.toString("ascii", at, at + 100).replace(/\0.*$/, "");
    if (!name) break;

    const size = parseInt(
      buffer.toString("ascii", at + 124, at + 136).replace(/\0.*$/, "").trim(),
      8,
    );
    const start = at + 512;
    out.push({ path: name, body: buffer.toString("utf8", start, start + size) });
    at = start + Math.ceil(size / 512) * 512;
  }

  return out;
}

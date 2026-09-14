import { describe, it, expect } from "vitest";
import {
  readUpload,
  ceilingFor,
  MAX_UPLOAD_BYTES,
  MAX_ARTIFACT_BYTES,
} from "@/lib/uploads";

describe("readUpload", () => {
  it("takes the type from the extension and the name from the rest", () => {
    expect(readUpload("Quarterly Report.html", 100)).toEqual({
      ok: true,
      name: "Quarterly Report",
      contentType: "html",
    });
    expect(readUpload("config.JSON", 100)).toEqual({
      ok: true,
      name: "config",
      contentType: "json",
    });
    expect(readUpload("notes.md", 100)).toEqual({
      ok: true,
      name: "notes",
      contentType: "article",
    });
    expect(readUpload("page.htm", 100)).toMatchObject({ contentType: "html" });
  });

  it("only strips the last extension", () => {
    expect(readUpload("archive.2024.json", 10)).toMatchObject({
      name: "archive.2024",
      contentType: "json",
    });
  });

  it("keeps the whole name when there is nothing but an extension", () => {
    expect(readUpload(".json", 10)).toMatchObject({ name: ".json" });
  });

  it("refuses what it cannot show, and says what it takes", () => {
    const result = readUpload("numbers.csv", 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Markdown, HTML and JSON");
    expect(result.error).toContain(".csv");
  });

  it("refuses a file with no extension at all", () => {
    expect(readUpload("README", 10).ok).toBe(false);
  });

  it("refuses one that is too large before uploading it", () => {
    const result = readUpload("huge.json", MAX_UPLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("kB");
  });

  // HTML goes to a file in a bucket rather than a column in a row, so none of
  // the reasons to be careful with the first apply to it.
  it("lets an HTML file be far larger, being a file rather than a column", () => {
    expect(readUpload("mockup.html", MAX_UPLOAD_BYTES * 10).ok).toBe(true);
    expect(ceilingFor("html")).toBe(MAX_ARTIFACT_BYTES);
    expect(ceilingFor("json")).toBe(MAX_UPLOAD_BYTES);

    const refused = readUpload("mockup.html", MAX_ARTIFACT_BYTES + 1);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toContain("MB");
  });
});

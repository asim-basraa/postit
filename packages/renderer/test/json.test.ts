import { describe, it, expect } from "vitest";
import { readJson, describeJson } from "../src/index";

describe("readJson", () => {
  it("reads a document and pretty-prints it", () => {
    const doc = readJson('{"b":1,"a":[1,2]}');
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;

    expect(doc.value).toEqual({ b: 1, a: [1, 2] });
    // Two spaces, and key order as written: neither is JSON.stringify's to
    // change, and a viewer that reorders keys is lying about the file.
    expect(doc.pretty).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it("accepts a bare value, which is still JSON", () => {
    expect(readJson("42")).toMatchObject({ ok: true, value: 42 });
    expect(readJson('"hello"')).toMatchObject({ ok: true, value: "hello" });
    expect(readJson("null")).toMatchObject({ ok: true, value: null });
  });

  it("gives a reason rather than throwing", () => {
    const doc = readJson("{ oops }");
    expect(doc.ok).toBe(false);
    if (doc.ok) return;
    expect(doc.reason.length).toBeGreaterThan(0);
  });

  it("treats an empty file as something to say, not something to crash on", () => {
    const doc = readJson("   \n ");
    expect(doc).toEqual({ ok: false, reason: "This file is empty." });
  });
});

describe("describeJson", () => {
  it("counts in the words a person would use", () => {
    expect(describeJson([1])).toBe("1 item");
    expect(describeJson([1, 2, 3])).toBe("3 items");
    expect(describeJson({ a: 1 })).toBe("1 key");
    expect(describeJson({ a: 1, b: 2 })).toBe("2 keys");
    expect(describeJson("a string")).toBe("");
  });
});

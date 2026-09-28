import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSPECTOR_SOURCE, injectInspector, readMessage } from "../src/index";

describe("@wave/inspector", () => {
  it("ships the current inspector.js (run npm run build in the package after editing it)", () => {
    const file = readFileSync(fileURLToPath(new URL("../src/inspector.js", import.meta.url)), "utf8");
    expect(INSPECTOR_SOURCE).toBe(file);
  });

  it("is valid script", () => {
    expect(() => new Function(INSPECTOR_SOURCE)).not.toThrow();
  });

  it("injects before </body>", () => {
    expect(injectInspector("<html><body><p>x</p></body></html>", "/i.js?b=1")).toBe(
      '<html><body><p>x</p>\n<script src="/i.js?b=1" data-wave-inspector></script>\n</body></html>',
    );
    expect(injectInspector("<p>x</p>", "/i.js")).toContain('<p>x</p>\n<script src="/i.js"');
  });

  it("accepts well formed messages and refuses the rest", () => {
    expect(readMessage({ type: "wave:hello" })).toEqual({ type: "wave:hello" });
    expect(readMessage({ type: "wave:pin-click", commentId: "c1" })).toEqual({ type: "wave:pin-click", commentId: "c1" });
    expect(readMessage({ type: "wave:pin-click" })).toBeNull();
    expect(readMessage({ type: "pi:hello" })).toBeNull();
    expect(readMessage({ type: "wave:range", pid: "n_ab12", start: 0, end: "3", quote: "abc" })).toBeNull();
    expect(readMessage(null)).toBeNull();
  });

  it("speaks only wave: messages", () => {
    expect(INSPECTOR_SOURCE).not.toMatch(/["']pi:[a-z]/);
  });
});

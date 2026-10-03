import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Post-it mounts every Wave endpoint through one catch-all route; a method the
// handlers serve but the route does not export answers 405 (PUT flows/:id/api did).
describe("the Wave route", () => {
  test("exports every method createWaveHandlers serves", () => {
    const handlers = readFileSync("packages/wave-server/src/handlers.ts", "utf8");
    const route = readFileSync("app/api/wave/[...path]/route.ts", "utf8");
    const served = new Set([...handlers.matchAll(/method === "(GET|POST|PUT|PATCH|DELETE)"/g)].map((m) => m[1]));
    expect(served.size).toBeGreaterThan(2);
    for (const m of served) expect(route, m).toMatch(new RegExp(`handle as ${m}\\b`));
  });
});

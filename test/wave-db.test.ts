import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Wave's schema in Post-it", () => {
  it("the migration carries packages/wave-db/sql/schema.sql verbatim", () => {
    const schema = readFileSync("packages/wave-db/sql/schema.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20260928100000_wave.sql", "utf8");
    const inner = migration.split("-- >>> wave schema\n")[1]?.split("-- <<< wave schema")[0];
    expect(inner).toBe(schema);
  });
});

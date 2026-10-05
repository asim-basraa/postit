import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Wave's schema in Post-it", () => {
  it("the migration carries packages/wave-db/sql/schema.sql verbatim", () => {
    const schema = readFileSync("packages/wave-db/sql/schema.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20260928100000_wave.sql", "utf8");
    const inner = migration.split("-- >>> wave schema\n")[1]?.split("-- <<< wave schema")[0];
    expect(inner).toBe(schema);
  });

  it("the projects migration carries packages/wave-db/sql/assets.sql verbatim", () => {
    const assets = readFileSync("packages/wave-db/sql/assets.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20260929100000_wave_projects.sql", "utf8");
    const inner = migration.split("-- >>> wave assets\n")[1]?.split("-- <<< wave assets")[0];
    expect(inner).toBe(assets);
  });

  it("the shared screens migration carries packages/wave-db/sql/shared-screens.sql verbatim", () => {
    const sql = readFileSync("packages/wave-db/sql/shared-screens.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20261002100000_wave_shared_screens.sql", "utf8");
    const inner = migration.split("-- >>> wave shared screens\n")[1]?.split("-- <<< wave shared screens")[0];
    expect(inner).toBe(sql);
  });

  it("the test runs migration carries packages/wave-db/sql/test-runs.sql verbatim", () => {
    const sql = readFileSync("packages/wave-db/sql/test-runs.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20261005100000_wave_test_runs.sql", "utf8");
    const inner = migration.split("-- >>> wave test runs\n")[1]?.split("-- <<< wave test runs")[0];
    expect(inner).toBe(sql);
  });
});

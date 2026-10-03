import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { readRequestUser, signRequestUser } from "@/lib/supabase/request-user";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "reader@example.com",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: { name: "Ünïcode Reader" },
  identities: [{ id: "x" }],
} as unknown as User;

describe("the user middleware hands to the page", () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  });
  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });

  it("reads back the user it signed, without the bulky parts", async () => {
    const header = await signRequestUser(user);
    const back = await readRequestUser(header);
    expect(back?.id).toBe(user.id);
    expect(back?.email).toBe(user.email);
    expect(back?.user_metadata).toEqual({ name: "Ünïcode Reader" });
    expect(back).not.toHaveProperty("identities");
  });

  it("says signed out when middleware found nobody", async () => {
    expect(await readRequestUser(await signRequestUser(null))).toBeNull();
  });

  it("knows nothing from a missing header", async () => {
    expect(await readRequestUser(null)).toBeUndefined();
    expect(await readRequestUser("")).toBeUndefined();
  });

  it("refuses a header whose contents were changed", async () => {
    const header = (await signRequestUser(user))!;
    const [, sig] = header.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: { ...user, id: "someone-else" }, t: Date.now() }),
    ).toString("base64url");
    expect(await readRequestUser(`${forged}.${sig}`)).toBeUndefined();
  });

  it("refuses a header signed with another secret", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "attacker";
    const header = await signRequestUser(user);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    expect(await readRequestUser(header)).toBeUndefined();
  });

  it("refuses a stale header", async () => {
    const header = await signRequestUser(user, Date.now() - 5 * 60_000);
    expect(await readRequestUser(header)).toBeUndefined();
  });

  it("trusts nothing when there is no secret to sign with", async () => {
    const header = await signRequestUser(user);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await signRequestUser(user)).toBeNull();
    expect(await readRequestUser(header)).toBeUndefined();
  });

  it("ignores garbage", async () => {
    expect(await readRequestUser("not-a-header")).toBeUndefined();
    expect(await readRequestUser("a.b")).toBeUndefined();
    expect(await readRequestUser("%%%.%%%")).toBeUndefined();
  });
});

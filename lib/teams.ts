import { createClient } from "@/lib/supabase/server";
import type { GrantResult, GrantRole } from "@/lib/grants";

export type Team = {
  id: string;
  name: string;
};

/** A team a particular node could be handed to, for the sharing dialog. */
export type GrantableTeam = {
  team_id: string;
  team_name: string;
  /** How many people that name covers, which is what you are choosing by. */
  member_count: number;
};

/** A team as the administration screen sees it. */
export type AdminTeam = {
  team_id: string;
  team_name: string;
  member_count: number;
  created_at: string;
};

export type TeamMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "member" | "manager";
};

export type TeamResult =
  | { ok: true; team: Team }
  | { ok: false; error: string; status: number };

/**
 * Every team, which is to say the company's directory of groups.
 *
 * Teams stopped belonging to a space, so there is nothing to scope this by. RLS
 * decides, and it decides that anybody with an account may read the list: the
 * rosters are open for the same reason, because choosing who to hand a document
 * to means being able to see the group first.
 */
export async function listTeams(): Promise<Team[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");
  return data ?? [];
}

/**
 * Every team with the size of it, for the administration screen.
 *
 * Empty for anybody who does not administer the platform, which is the same
 * answer the rest of this schema gives for anything out of reach.
 */
export async function adminTeams(): Promise<AdminTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("all_teams");
  if (error) {
    console.error("all_teams failed: %s", error.message);
    return [];
  }
  return (data as AdminTeam[] | null) ?? [];
}

/**
 * The teams this node could be shared with, which is all of them.
 *
 * Still asked of the node rather than listed outright, because the answer is
 * gated on being able to share the node at all: the picker cannot become a way
 * to ask a general question from a page you have nothing to do with.
 */
export async function grantableTeams(
  nodeId: string,
): Promise<GrantableTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grantable_teams", {
    p_node_id: nodeId,
  });

  if (error) {
    console.error("grantable_teams failed: %s", error.message);
    return [];
  }
  return (data as GrantableTeam[] | null) ?? [];
}

/** Makes a team. The database allows this to administrators and nobody else. */
export async function createTeam(name: string): Promise<TeamResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "A name is required.", status: 400 };

  const supabase = await createClient();

  // Same trick as createNode: an INSERT ... RETURNING applies the SELECT policy
  // against the pre-insert snapshot. Generating the id here lets the row be
  // read back separately.
  const id = crypto.randomUUID();

  const { error } = await supabase.from("teams").insert({ id, name: trimmed });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        // Names are the company's now, so this is not about one space.
        error: `A team called "${trimmed}" already exists.`,
        status: 409,
      };
    }
    // Anything else, a policy refusal included, reads as not-found.
    return { ok: false, error: "Not found.", status: 404 };
  }

  const { data, error: readError } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", id)
    .single();

  if (readError) return { ok: false, error: "Not found.", status: 404 };
  return { ok: true, team: data };
}

export async function deleteTeam(teamId: string): Promise<GrantResult> {
  const supabase = await createClient();
  // Grants naming this team go with it through ON DELETE CASCADE, so deleting a
  // team really does remove the access it conferred.
  const { data, error } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .select("id");

  if (error) return { ok: false, error: error.message, status: 400 };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  return { ok: true };
}

/**
 * Who is on a team. Anybody signed in may ask.
 *
 * Through team_roster rather than team_members directly: a profile is private
 * to its owner, so joining for addresses in an ordinary query returns nothing.
 */
export async function teamRoster(teamId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_roster", { p_team_id: teamId });
  return (data as TeamMember[] | null) ?? [];
}

/**
 * Adds someone to a team by address.
 *
 * The address is resolved inside the database for the same reason sharing is:
 * profiles are private, and add_team_member is the controlled hole. It checks
 * that the caller administers the platform before it looks at the address, so
 * this cannot be used to find out who has an account.
 */
export async function addTeamMember(
  teamId: string,
  email: string,
  role: "member" | "manager" = "member",
): Promise<GrantResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "An email address is required.", status: 400 };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_team_member", {
    p_team_id: teamId,
    p_email: trimmed,
    p_role: role,
  });

  if (!error) return { ok: true };

  if (error.code === "P0002" && /no account exists/i.test(error.message)) {
    return {
      ok: false,
      error: `No Post-it account exists for ${trimmed}. They need to sign up first.`,
      status: 404,
    };
  }

  return { ok: false, error: "Not found.", status: 404 };
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<GrantResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_team_member", {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) return { ok: false, error: "Not found.", status: 404 };
  return { ok: true };
}

/**
 * Shares a node with a team.
 *
 * Through grant_to_team rather than a client-side upsert: the uniqueness rule
 * on `grants` is a partial index, and inferring it needs an ON CONFLICT clause
 * carrying the same predicate, which PostgREST cannot express. The function
 * makes the same admin check RLS would, and the trigger that decides whether
 * this team is yours to name still runs.
 */
export async function shareWithTeam(
  nodeId: string,
  teamId: string,
  role: GrantRole,
): Promise<GrantResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("grant_to_team", {
    p_node_id: nodeId,
    p_team_id: teamId,
    p_role: role,
  });

  if (!error) return { ok: true };

  // Every team is shareable now, so the only way to hit this is to name one
  // that does not exist. Said plainly rather than as not-found: the picker only
  // ever offers real teams, so anybody here reached past it.
  if (/not yours to share with|no such team/i.test(error.message)) {
    return { ok: false, error: "There is no such team.", status: 404 };
  }

  return { ok: false, error: "Not found.", status: 404 };
}

export type TeamReach = {
  node_id: string;
  label: string;
  href: string;
  role: GrantRole;
  space_name: string;
};

export type MyTeam = {
  team_id: string;
  team_name: string;
  my_role: "member" | "manager";
  member_count: number;
  reach_count: number;
  added_at: string;
  added_by: string | null;
};

/**
 * What a team reaches: the pages and folders shared with it.
 *
 * The people on it and the platform's administrators get an answer; anybody
 * else gets an empty list, which is what a team that does not exist gives too.
 * Deliberately narrower than the roster: this is a list of documents.
 */
export async function teamReach(teamId: string): Promise<TeamReach[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_reach", { p_team_id: teamId });
  return (data as TeamReach[] | null) ?? [];
}

/** The teams the caller is on. */
export async function myTeams(): Promise<MyTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_teams");
  if (error) {
    console.error("my_teams failed: %s", error.message);
    return [];
  }
  return (data as MyTeam[] | null) ?? [];
}

/**
 * Everything all of the caller's teams reach, keyed by team.
 *
 * One call rather than one per team: the page groups the rows itself.
 */
export async function myTeamReach(): Promise<Map<string, TeamReach[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_team_reach");
  if (error) {
    console.error("my_team_reach failed: %s", error.message);
    return new Map();
  }

  const byTeam = new Map<string, TeamReach[]>();
  for (const row of (data as (TeamReach & { team_id: string })[] | null) ?? []) {
    const list = byTeam.get(row.team_id);
    if (list) list.push(row);
    else byTeam.set(row.team_id, [row]);
  }
  return byTeam;
}

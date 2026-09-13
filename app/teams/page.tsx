import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { myTeams, myTeamReach, teamRoster, adminTeams } from "@/lib/teams";
import { AppHeader } from "@/components/AppHeader";
import { NavLink } from "@/components/NavLink";
import { isPlatformAdmin } from "@/lib/admin";
import { Manage } from "./Manage";

export const metadata = { title: "Teams" };
export const dynamic = "force-dynamic";

/**
 * The one screen about teams.
 *
 * There used to be two, which is what made teams confusing: your own were here,
 * and administering them happened inside whichever space the team had been made
 * in. A team belongs to no space now, so there is one place for them.
 *
 * For everybody: the teams you are on, who else is on them, and what each one
 * lets you reach. Read-only, because membership confers no administration over
 * the team itself. What it does confer is nothing at all on its own, which the
 * page says in words, because that is the question everybody arrives with.
 *
 * For an administrator, additionally: every team, and the making, filling and
 * deleting of them.
 */
export default async function MyTeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [teams, reach, admin] = await Promise.all([
    myTeams(),
    myTeamReach(),
    isPlatformAdmin(),
  ]);

  // Empty for anybody else, so this is the database deciding rather than the
  // page: a non-administrator who reached it would still be handed nothing.
  const everyTeam = admin ? await adminTeams() : [];

  return (
    <main className="shell">
      <AppHeader email={user.email} admin={admin} />

      <h1>Teams</h1>
      <p className="lede">
        A team is a name for a group of people in this company. Being on one is
        not access in itself: it is a name that pages get shared with, so that
        sharing once reaches everybody on it at once, and taking somebody off
        takes their access with them. You can share your own pages with any
        team, whether or not you are on it.
      </p>

      <h2 className="teams-mine">Teams you are on</h2>

      {teams.length === 0 ? (
        <p className="empty">
          You are not on any team. Nothing is missing: most sharing is done
          person by person. Teams are set up by whoever administers Post-it.
        </p>
      ) : (
        <ul className="my-teams">
          {teams.map((team) => {
            const items = reach.get(team.team_id) ?? [];
            return (
              <li key={team.team_id} className="my-team">
                {/* h3 rather than h2 now: the section above it is the h2, and
                    a heading level is a position in an outline rather than a
                    size. */}
                <h3 className="my-team-name">{team.team_name}</h3>

                <p className="my-team-meta">
                  {team.member_count === 1
                    ? "You are the only person on it"
                    : `${team.member_count} people on it`}
                  {/* "added by you" answers nothing. The line exists to tell
                      somebody who put them on a team they did not join. */}
                  {team.added_by && team.added_by !== user.email
                    ? ` · added by ${team.added_by}`
                    : null}
                </p>

                {items.length === 0 ? (
                  <p className="hint">
                    Nothing has been shared with this team yet, so it gives you
                    nothing to read for the moment. That is the ordinary state of
                    a new team, not a fault. Anybody can share a page or folder
                    of their own with it, from the Share button on that page, and
                    it appears here.
                  </p>
                ) : (
                  <>
                    <p className="my-team-why">
                      Being on this team is why you can read:
                    </p>
                    <ul className="team-reach-list">
                      {items.map((item) => (
                        <li key={item.node_id}>
                          <NavLink
                            href={item.href}
                            className="team-reach-what"
                          >
                            {item.label}
                          </NavLink>
                          <span className="team-reach-role">
                            {item.role} · and everything beneath it
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <Roster teamId={team.team_id} />
              </li>
            );
          })}
        </ul>
      )}

      {admin ? <Manage initial={everyTeam} /> : null}

      <p className="back">
        <NavLink href="/spaces">Back to your spaces</NavLink>
      </p>
    </main>
  );
}

/**
 * Who else is on the team.
 *
 * Its own server component so each roster is a separate read: a team you are on
 * is readable, and asking for all of them in one call would mean one function
 * returning everybody's address across every team, which is a larger hole than
 * the question needs.
 */
async function Roster({ teamId }: { teamId: string }) {
  const members = await teamRoster(teamId);

  if (members.length === 0) return null;

  return (
    <details className="my-team-roster">
      <summary>Who else is on it</summary>
      <ul className="team-members">
        {members.map((member) => (
          <li key={member.user_id}>
            <span className="member-email">
              {member.display_name ?? member.email}
            </span>
            {member.display_name ? (
              <span className="my-team-addr">{member.email}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

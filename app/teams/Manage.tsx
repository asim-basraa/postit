"use client";

import { useState, useTransition } from "react";
import type { AdminTeam, TeamMember, TeamReach } from "@/lib/teams";
import { NavLink } from "@/components/NavLink";

/**
 * The administration half of the teams screen.
 *
 * Teams used to be made and managed inside a space, by whoever owned it, which
 * meant the group called GPv2 was administered from wherever it happened to be
 * created. A team belongs to nobody's space now: it is a group of people in
 * this company, and the people who run the company run the list.
 */
export function Manage({ initial }: { initial: AdminTeam[] }) {
  const [teams, setTeams] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const res = await fetch("/api/v1/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? `Could not create that team (${res.status})`);
      return;
    }

    setName("");
    setTeams((current) =>
      [
        ...current,
        {
          team_id: body.team.id,
          team_name: body.team.name,
          member_count: 0,
          created_at: new Date().toISOString(),
        },
      ].sort(byName),
    );
  }

  async function remove(team: AdminTeam) {
    setError(null);
    const res = await fetch(`/api/v1/teams/${team.team_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Could not delete that team.");
      return;
    }
    startTransition(() => {
      setTeams((current) => current.filter((t) => t.team_id !== team.team_id));
    });
  }

  return (
    <section className="account-section teams">
      <h2>All teams</h2>
      <p className="hint">
        Yours to run, because you administer Post-it. A team is a name for a
        group of people and confers nothing by itself: somebody has to share a
        page with it. Everybody signed in can see these teams and who is on
        them, and can share their own pages with any of them.
      </p>

      {error ? (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="team-form" onSubmit={create}>
        <label className="field">
          <span className="field-label">New team</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Engineering"
            required
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          Create team
        </button>
      </form>

      {teams.length === 0 ? (
        <p className="empty">No teams yet.</p>
      ) : (
        <ul className="team-list">
          {teams.map((team) => (
            <TeamCard key={team.team_id} team={team} onDelete={remove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamCard({
  team,
  onDelete,
}: {
  team: AdminTeam;
  onDelete: (team: AdminTeam) => void;
}) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [reach, setReach] = useState<TeamReach[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/v1/teams/${team.team_id}/members`);
    if (!res.ok) {
      setError("Could not load this team.");
      setMembers([]);
      setReach([]);
      return;
    }
    const body = await res.json();
    setMembers(body.members ?? []);
    setReach(body.reach ?? []);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/v1/teams/${team.team_id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? `Could not add them (${res.status})`);
      return;
    }

    setEmail("");
    setMembers(body.members ?? []);
    setReach(body.reach ?? []);
  }

  async function removeMember(member: TeamMember) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/v1/teams/${team.team_id}/members/${member.user_id}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      setError("Could not remove them.");
      return;
    }
    void load();
  }

  const size = members?.length ?? team.member_count;

  return (
    <li className="team-card">
      <details onToggle={(e) => e.currentTarget.open && !members && load()}>
        <summary>
          <span className="team-name">{team.team_name}</span>
          <span className="team-size">
            {size === 1 ? "1 person" : `${size} people`}
          </span>
        </summary>

        {error ? (
          <p className="msg msg-error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="team-member-form" onSubmit={add}>
          <label className="field">
            <span className="field-label">Add by email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@maqsoodlabs.com"
              required
            />
          </label>
          <button className="btn btn-small" type="submit" disabled={busy}>
            Add
          </button>
        </form>

        {members === null ? (
          <p className="tree-empty">Loading…</p>
        ) : members.length === 0 ? (
          <p className="tree-empty">Nobody on this team yet.</p>
        ) : (
          <ul className="team-members">
            {members.map((member) => (
              <li key={member.user_id}>
                <span className="member-email">{member.email}</span>
                <button
                  className="btn btn-secondary btn-small"
                  type="button"
                  onClick={() => removeMember(member)}
                  disabled={busy}
                  aria-label={`Remove ${member.email} from ${team.team_name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <Reach reach={reach} teamName={team.team_name} />

        <p className="team-danger">
          <button
            className="btn btn-secondary btn-small"
            type="button"
            onClick={() => onDelete(team)}
            aria-label={`Delete the team ${team.team_name}`}
          >
            Delete team
          </button>
          <span className="hint">
            Deleting a team also removes every grant made to it.
          </span>
        </p>
      </details>
    </li>
  );
}

/**
 * What this team can actually reach.
 *
 * A team with nobody's pages in it looks broken, and a team with somebody on it
 * looks like it must have granted them something. Both readings are wrong, and
 * neither was contradicted anywhere on this screen. Being on a team is not
 * being given anything; a grant is, and this is the list of them.
 */
function Reach({
  reach,
  teamName,
}: {
  reach: TeamReach[] | null;
  teamName: string;
}) {
  if (reach === null) return null;

  return (
    <div className="team-reach">
      <h3 className="team-reach-head">What this team can reach</h3>

      {reach.length === 0 ? (
        <p className="hint">
          Nothing yet. Being on {teamName} grants nobody anything on its own.
          Anybody can open a page of their own, choose Share, and share it with{" "}
          {teamName}: everyone on the team gets it at once, and anyone taken off
          the team loses it.
        </p>
      ) : (
        <ul className="team-reach-list">
          {reach.map((item) => (
            <li key={item.node_id}>
              <NavLink href={item.href} className="team-reach-what">
                {item.label}
              </NavLink>
              <span className="team-reach-role">
                {item.role} · and everything beneath it
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function byName(a: AdminTeam, b: AdminTeam) {
  return a.team_name.localeCompare(b.team_name);
}

"use client";

import { useState, useTransition } from "react";
import type { AdminTeam, TeamMember } from "@/lib/teams";

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
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/v1/teams/${team.team_id}/members`);
    if (!res.ok) {
      setError("Could not load this team.");
      setMembers([]);
      return;
    }
    const body = await res.json();
    setMembers(body.members ?? []);
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

        {/* No list of what this team reaches. Administering the platform is a
            power over accounts, not over pages: an administrator cannot read
            what they have not been given, so the list would be empty whatever
            the team actually holds, and an empty list here would read as
            "nothing has been shared with them", which is a different claim and
            usually a false one. The people on the team see it, on their own
            half of this screen, where it is true. */}
        <p className="hint team-reach-note">
          What this team can reach is shown to the people on it. Running the
          roster is not a way to read what has been shared with them.
        </p>

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

function byName(a: AdminTeam, b: AdminTeam) {
  return a.team_name.localeCompare(b.team_name);
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copyable } from "@/components/Copyable";
import { setSkillsetAction } from "@/app/spaces/actions";

/**
 * The Skillset button, and the dialog it opens.
 *
 * Two jobs, which is why it is one dialog rather than a switch somewhere and
 * instructions somewhere else: saying that this space holds skills, and saying
 * how to install them. The second is the reason anybody does the first.
 *
 * It is careful to say what the mark does not do. It sits beside Members and
 * Share, both of which change who can reach things, and the natural reading of
 * a new toggle in that company is that this one does too. It does not. A
 * skillset is a space and is shared like one; whoever could read these pages
 * before can read them after, and nobody else can.
 */
export function Skillset({
  spaceId,
  spaceSlug,
  spaceName,
  isSkillset,
  base,
}: {
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  isSkillset: boolean;
  /** The address this page was reached on, so the snippets are copy-paste. */
  base: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(next: boolean) {
    startTransition(async () => {
      const result = await setSkillsetAction(spaceId, next);
      setError(result.error ?? null);
      if (!result.error) router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={() => setOpen(true)}
      >
        Skillset
      </button>

      {open ? (
        <dialog
          className="share-dialog dialog-centred"
          open
          aria-label={`Skillset settings for ${spaceName}`}
        >
          <div className="share-head">
            <h2>Skillset</h2>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {error ? (
            <p className="msg msg-error" role="alert">
              {error}
            </p>
          ) : null}

          <label className="field field-check">
            <input
              type="checkbox"
              checked={isSkillset}
              disabled={pending}
              onChange={(e) => set(e.target.checked)}
            />
            <span className="field-label">
              What this space holds is skills
            </span>
          </label>

          <p className="hint">
            Marking it changes nothing about who can read anything. It is still
            a space, shared with the same people and teams, and a page nobody
            gave you is still a page you cannot see. What it adds is that the
            skills in here can be fetched as files, in the layout agent tools
            expect, by anybody you have already shared them with.
          </p>

          {isSkillset ? (
            <>
              <h3 className="shared-head">Installing from here</h3>
              <p className="hint">
                The address carries an MCP token, and the token is you: it
                reaches exactly the skills its owner can reach, and no more.
                Each person uses their own, so what they install is what they
                were given. Make one on{" "}
                <Link href="/settings/mcp">the Connect page</Link>, and pin it
                to this space so a leaked address costs one skillset rather
                than an account.
              </p>

              <Copyable
                label="Install every skill in this skillset"
                text={`npx skills add ${base}/k/YOUR_TOKEN/${spaceSlug}.tar.gz`}
              />
              <Copyable
                label="Install one skill"
                text={`npx skills add ${base}/k/YOUR_TOKEN/${spaceSlug}/SKILL_NAME/SKILL.md`}
                collapsed
              />
              <Copyable
                label="See what a token can reach"
                text={`curl ${base}/k/YOUR_TOKEN`}
                collapsed
              />

              <p className="hint">
                A skill is a page whose type is skill, with a name and a
                description in its frontmatter. The folder each one installs
                into is named from that frontmatter, not from the page, because
                the standard wants a skill and its folder to agree.
              </p>
            </>
          ) : null}
        </dialog>
      ) : null}
    </>
  );
}

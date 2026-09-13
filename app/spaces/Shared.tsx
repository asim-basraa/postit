"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Share } from "@/lib/shares";
import { Pending } from "@/components/NavLink";

/**
 * What other people have handed you.
 *
 * Marked seen from here rather than while rendering on the server, because a
 * render is not a reading: the request that builds this page might be a
 * prefetch, and marking then would clear the very thing somebody came to see.
 */
export function Shared({ shares }: { shares: Share[] }) {
  const router = useRouter();
  const unseen = shares.some((s) => s.is_new);

  useEffect(() => {
    if (!unseen) return;
    let gone = false;

    void (async () => {
      await fetch("/api/v1/shares/seen", { method: "POST" });
      // As in the inbox: the badges were rendered before this marked them
      // seen, so without throwing the cached tree away they sit there saying
      // "new" about things you are looking at. The refreshed render has
      // is_new false throughout, which is what stops this repeating.
      if (!gone) router.refresh();
    })();

    return () => {
      gone = true;
    };
  }, [unseen, router]);

  if (shares.length === 0) return null;

  return (
    <section className="shared">
      <h2>Shared with you</h2>

      <ul className="shared-list">
        {shares.map((share, i) => (
          <li key={`${share.kind}-${share.href ?? share.label}-${i}`}>
            {share.is_new ? <span className="shared-new">new</span> : null}

            {share.href ? (
              <Link href={share.href} className="shared-what">
                {share.label}
                <Pending />
              </Link>
            ) : (
              <span className="shared-what">{share.label}</span>
            )}

            <span className="shared-why">
              {share.kind === "team"
                ? "added to this team"
                : `${share.role} in ${share.detail}`}
              {share.actor ? ` · by ${share.actor}` : null}
            </span>

            <span className="shared-when">{when(share.happened_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

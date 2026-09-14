"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { person } from "@/lib/people";
import type { Review as State, ReviewStatus } from "@/lib/review";

/**
 * Where a document is in a review, and what you can do about it.
 *
 * Nothing is shown for a page nobody has asked to have reviewed, beyond a
 * quiet button for whoever may edit it. That is the point of the feature:
 * review is something an author opts into for the documents that need it, not
 * a lifecycle every note is dragged through. A page with no status is not a
 * draft, it is a page.
 */
export function Review({
  nodeId,
  review,
}: {
  nodeId: string;
  review: State;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ReviewStatus | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(status: ReviewStatus | null) {
    setBusy(status ?? "clear");
    setError(null);

    try {
      const res = await fetch(`/api/v1/nodes/${nodeId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `That did not work (${res.status})`);
        return;
      }

      // The state is rendered on the server, so the new one has to come from
      // there: refreshing is what makes the strip say what the database says.
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing changed.");
    } finally {
      setBusy(null);
    }
  }

  // Nothing to say and nothing to offer: most pages, most of the time.
  if (review.status === null && !review.may_ask) return null;

  if (review.status === null) {
    return (
      <div className="review">
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={busy !== null}
          onClick={() => void move("in_review")}
        >
          {busy ? "Asking…" : "Ask for review"}
        </button>
        {error ? <Problem>{error}</Problem> : null}
      </div>
    );
  }

  const who = review.actor ? person(review.actor).label : null;
  const approved = review.status === "approved";

  return (
    <div className={approved ? "review review-approved" : "review review-open"}>
      <span className="review-state">
        {approved ? "Approved" : "Under review"}
      </span>

      <span className="review-who">
        {approved ? "by" : "asked by"} {who ?? "somebody since departed"}
        {review.happened_at ? ` · ${when(review.happened_at)}` : null}
      </span>

      {/* The one thing a badge like this could get genuinely wrong: an
          approval is of a document, not of a name, and going quiet about an
          edit afterwards would make it say something untrue. */}
      {review.stale ? (
        <span className="review-stale">
          {approved ? "changed since" : "changed since it was sent"}
        </span>
      ) : null}

      {review.may_approve ? (
        <button
          className="btn btn-small"
          type="button"
          disabled={busy !== null}
          onClick={() => void move("approved")}
        >
          {busy === "approved" ? "Approving…" : "Approve"}
        </button>
      ) : null}

      {review.may_ask ? (
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={busy !== null}
          onClick={() => void move(null)}
        >
          {approved ? "Clear" : "Withdraw"}
        </button>
      ) : null}

      {error ? <Problem>{error}</Problem> : null}
    </div>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <p className="msg msg-error review-error" role="alert">
      {children}
    </p>
  );
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

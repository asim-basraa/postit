import { createClient } from "@/lib/supabase/server";

/**
 * Where a document is in a review, when somebody asked for one.
 *
 * Null is the ordinary state and the common one: most pages are never sent for
 * review and carry nothing at all. This is a label the author opts into, not a
 * stage every document passes through, and nothing about a page without one
 * should suggest it is waiting for something.
 */
export type ReviewStatus = "in_review" | "approved";

export type Review = {
  status: ReviewStatus | null;
  /** Who last moved it, by address, or null when their account is gone. */
  actor: string | null;
  happened_at: string | null;
  /** The page has been edited since, so the approval is of older text. */
  stale: boolean;
  /** Whether the caller may send it for review, withdraw, or clear it. */
  may_ask: boolean;
  may_approve: boolean;
};

export type ReviewResult =
  | { ok: true; status: ReviewStatus | null }
  | { ok: false; error: string; status: number };

/**
 * The review state of one page, or null when there is nothing to say.
 *
 * Null covers three cases that look identical from here and should: no such
 * page, a page this caller may not read, and a caller who is not signed in.
 */
export async function nodeReview(nodeId: string): Promise<Review | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("node_review", { p_node_id: nodeId })
    .maybeSingle<Review>();

  if (error) {
    console.error("node_review failed for %s: %s", nodeId, error.message);
    return null;
  }
  return data;
}

/**
 * Moves a page through the flow, or takes it out of one.
 *
 * Every rule is the database's: who may ask, who may approve, and what may
 * follow what. This translates the refusal into a status code and leaves the
 * sentence alone, because the sentence was written to be read by whoever
 * pressed the button.
 */
export async function setReviewStatus(
  nodeId: string,
  status: ReviewStatus | null,
): Promise<ReviewResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_review_status", {
    p_node_id: nodeId,
    p_status: status,
  });

  if (!error) return { ok: true, status };

  // A page the caller cannot read answers exactly as a page that is not there.
  if (/not found/i.test(error.message)) {
    return { ok: false, error: "Not found.", status: 404 };
  }

  // The rest are refusals about a page they are looking at, so they say why.
  const message = error.message.replace(/^.*?:\s*/, "");
  return { ok: false, error: message, status: 409 };
}

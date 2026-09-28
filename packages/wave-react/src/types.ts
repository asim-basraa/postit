import type { ScreenView } from "@wave/server/view";
import type { CommentAnchor, CommentStatus } from "@wave/spec/anchor";

/** A comment as the review panel shows it. Hosts return this shape from their comment API. */
export type ReviewComment = {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_email: string;
  body: string;
  created_at: string;
  deleted: boolean;
  anchor?: CommentAnchor | null;
  content_version?: number | null;
  status?: CommentStatus | null;
  status_note?: string | null;
  status_version?: number | null;
  status_by_email?: string | null;
  status_at?: string | null;
};

/** What GET screens/:id answers, with comments in the panel's shape. */
export type ReviewView = Omit<ScreenView, "comments"> & { comments: ReviewComment[] };

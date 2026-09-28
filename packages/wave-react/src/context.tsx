"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { CommentAnchor, CommentStatus } from "@wave/spec/anchor";
import type { ReviewComment, ReviewView } from "./types";

export type WaveLinkProps = { href: string; className?: string; title?: string; children?: ReactNode };

export type Outcome = { ok: boolean; error?: string };

/**
 * What the review components need from the product they run in.
 *
 * Wave's own API (the screen, its edits, the flow) is reached at api, where
 * the host mounted createWaveHandlers. Everything else is the host's: its
 * router, its addresses, and its comments, which live in its own tables.
 */
export type WaveUi = {
  /** Where the host mounted Wave's handlers, e.g. "/api/wave". */
  api: string;
  /** The host's link component (Next's Link, a router link). Defaults to <a>. */
  Link?: ComponentType<WaveLinkProps>;
  navigate(href: string): void;
  back(): void;
  /** Re-reads server-rendered data after a change (Next's router.refresh). */
  refresh(): void;
  hrefs: {
    /** The review screen for a screen, optionally opened at one node. */
    review(screenId: string, nodeId?: string | null): string;
    compare(screenId: string): string;
    /** Where "back" goes from a screen: its flow if it has one, else the screen's page in the host. */
    back(view: ReviewView): string;
  };
  comments: {
    list(screenId: string): Promise<ReviewComment[] | null>;
    add(
      screenId: string,
      comment: { body: string; parent_id: string | null; anchor: CommentAnchor | null; content_version: number },
    ): Promise<Outcome & { comments?: ReviewComment[] }>;
    setStatus(id: string, status: CommentStatus, note: string | null, version: number): Promise<Outcome>;
    reattach(id: string, anchor: CommentAnchor, version: number): Promise<Outcome>;
    remove(id: string): Promise<void>;
  };
};

const WaveContext = createContext<WaveUi | null>(null);

export function WaveProvider({ ui, children }: { ui: WaveUi; children: ReactNode }) {
  return <WaveContext.Provider value={ui}>{children}</WaveContext.Provider>;
}

export function useWave(): WaveUi {
  const ui = useContext(WaveContext);
  if (!ui) throw new Error("Wave components need a <WaveProvider> above them.");
  return ui;
}

function PlainLink({ href, className, title, children }: WaveLinkProps) {
  return (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  );
}

/** The host's link, or a plain anchor. */
export function WaveLink(props: WaveLinkProps) {
  const ui = useContext(WaveContext);
  const L = ui?.Link ?? PlainLink;
  return <L {...props} />;
}

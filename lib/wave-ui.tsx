"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { WaveProvider, type ReviewComment, type WaveUi } from "@wave/react";
import { WAVE_BASE } from "@/lib/wave-routes";

/**
 * Wave's review components, told how Post-it works: Next's router for
 * navigation, /review/<id> for a screen, the space tree for everything else,
 * and Post-it's own comment API.
 */
export function PostitWave({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ui = useMemo<WaveUi>(() => {
    const json = async (res: Response) => (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const patch = async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/v1/comments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await json(res);
      return res.ok ? { ok: true } : { ok: false, error: (out.error as string) ?? undefined };
    };
    return {
      api: WAVE_BASE,
      Link,
      navigate: (href) => router.push(href),
      back: () => router.back(),
      refresh: () => router.refresh(),
      hrefs: {
        review: (id, node) => `/review/${id}${node ? `?node=${encodeURIComponent(node)}` : ""}`,
        compare: (id) => `/review/${id}/compare`,
        back: (view) => {
          const space = String((view.node as { space_slug?: string }).space_slug ?? "");
          return `/s/${space}/${view.flow ? view.flow.path : view.node.path}`;
        },
      },
      comments: {
        async list(screenId) {
          const res = await fetch(`/api/v1/nodes/${screenId}/comments`, { cache: "no-store" });
          if (!res.ok) return null;
          return ((await res.json()) as { comments: ReviewComment[] }).comments;
        },
        async add(screenId, comment) {
          const res = await fetch(`/api/v1/nodes/${screenId}/comments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(comment),
          });
          const out = await json(res);
          return res.ok
            ? { ok: true, comments: out.comments as ReviewComment[] | undefined }
            : { ok: false, error: (out.error as string) ?? undefined };
        },
        setStatus: (id, status, note, version) => patch(id, { status, note, version }),
        reattach: (id, anchor, version) => patch(id, { anchor, version }),
        async remove(id) {
          await fetch(`/api/v1/comments/${id}`, { method: "DELETE" });
        },
      },
    };
  }, [router]);
  return <WaveProvider ui={ui}>{children}</WaveProvider>;
}

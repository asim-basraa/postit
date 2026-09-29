"use client";

import { useMemo } from "react";
import { PrototypeApp, WaveProvider, type WaveUi } from "@wave/react";
import type { PrototypeView } from "@wave/server/prototype";

/** The prototype viewer with nothing of the product around it: frames come from the link's own route. */
export function SharedPrototype({ token, view }: { token: string; view: PrototypeView }) {
  const ui = useMemo<WaveUi>(
    () => ({
      api: `/play/${encodeURIComponent(token)}`,
      navigate: (href) => window.location.assign(href),
      back: () => window.history.back(),
      refresh: () => {},
      hrefs: { review: () => "#", compare: () => "#", back: () => "#" },
      comments: {
        list: async () => [],
        add: async () => ({ ok: false }),
        setStatus: async () => ({ ok: false }),
        reattach: async () => ({ ok: false }),
        remove: async () => {},
      },
    }),
    [token],
  );
  return (
    <WaveProvider ui={ui}>
      <PrototypeApp view={view} backHref={null} />
    </WaveProvider>
  );
}

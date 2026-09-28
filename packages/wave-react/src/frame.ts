"use client";

import { useCallback, useEffect, useRef } from "react";
import { PROTOCOL_VERSION, readMessage, type FrameMessage } from "@wave/inspector/protocol";

export type { Box, ElementRef, FrameMessage, StyleEntry, Styles } from "@wave/inspector/protocol";
export { readMessage };

/** A frame ref, a way to post to it, and a subscription to what it says. */
export function useFrame(onMessage: (m: FrameMessage) => void) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = readMessage(e.data);
      if (m) handler.current(m);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  const post = useCallback((message: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ ...message, protocol: PROTOCOL_VERSION }, "*");
  }, []);

  return { frame, post };
}

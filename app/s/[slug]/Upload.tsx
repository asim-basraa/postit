"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readUpload, UPLOAD_ACCEPT, UPLOAD_KINDS } from "@/lib/uploads";

/**
 * Bringing a file that already exists.
 *
 * One request: the page is created with its contents in the same call, so a
 * file refused for its size or its extension leaves nothing half-made behind.
 * The extension decides the type, and the type is the only thing an upload
 * knows that typing does not.
 *
 * Everything after this point is ordinary. An uploaded file is a page like any
 * other: the same tree, the same history from its first version, the same
 * sharing, the same permission questions asked of the same policies.
 */
export function Upload({
  spaceId,
  spaceSlug,
  parentId,
  className = "btn btn-secondary btn-small",
  label = "Upload",
  onError,
}: {
  spaceId: string;
  spaceSlug: string;
  /** The folder to put it in, or null for the top of the space. */
  parentId: string | null;
  className?: string;
  label?: string;
  /**
   * Where to say what went wrong, when the caller has somewhere better.
   *
   * The sidebar's header is a row of very small buttons and a paragraph in the
   * middle of it wrecks the row, so the tree takes its own errors and shows
   * them where it shows every other one.
   */
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<string | null>(null);

  const setError = (message: string | null) => {
    if (onError) onError(message ?? "");
    else setOwn(message);
  };

  /**
   * Emptying the picker is what lets the same file be chosen twice: a change
   * event does not fire for a value that has not changed, so without this the
   * second attempt at a file that failed does nothing at all.
   */
  const forget = () => {
    if (input.current) input.current.value = "";
  };

  async function chosen(file: File | undefined) {
    if (!file) return;
    setError(null);

    const upload = readUpload(file.name, file.size);
    if (!upload.ok) {
      forget();
      setError(upload.error);
      return;
    }

    setBusy(true);
    try {
      // Read before the picker is emptied, and only then.
      const content = await file.text();
      forget();

      const res = await fetch("/api/v1/nodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          space_id: spaceId,
          parent_id: parentId,
          kind: "file",
          name: upload.name,
          content_type: upload.contentType,
          content,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Could not upload that (${res.status})`);
        return;
      }

      // Straight to it, like creating anything else here: the first thing
      // anybody wants after uploading a file is to see whether it looks right.
      startTransition(() => {
        router.push(`/s/${spaceSlug}/${body.node.path}`);
        router.refresh();
      });
    } catch {
      setError("Could not reach the server. Nothing was uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={className}
        type="button"
        disabled={busy || pending}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </button>

      {/* Hidden rather than absent: the button is what people see, and this is
          the only thing that can open a file picker. */}
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept={UPLOAD_ACCEPT}
        aria-label={`Upload a file (${UPLOAD_KINDS})`}
        onChange={(e) => void chosen(e.target.files?.[0])}
      />

      {own ? (
        <p className="msg msg-error upload-error" role="alert">
          {own}
        </p>
      ) : null}
    </>
  );
}

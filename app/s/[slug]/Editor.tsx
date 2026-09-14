"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readSkillMetadata, readJson } from "@postit/renderer";
import { startingContent, type ContentType } from "@/lib/content-types";

/** What the editing box is holding, for the people who cannot see it. */
const SOURCE_LABEL: Record<ContentType, string> = {
  article: "Markdown source",
  skill: "Markdown source",
  html: "HTML source",
  json: "JSON source",
};

type Props = {
  nodeId: string;
  nodeName: string;
  initialContent: string;
  initialVersion: number;
  initialContentType: ContentType;
  viewHref: string;
};

export function Editor({
  nodeId,
  nodeName,
  initialContent,
  initialVersion,
  initialContentType,
  viewHref,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>(
    initialContentType,
  );

  const dirty = content !== initialContent;

  // Advisory, never blocking. A skill missing a description still saves: losing
  // somebody's writing over a formatting detail is a much worse outcome than an
  // incomplete skill, so this warns and gets out of the way.
  const missing =
    contentType === "skill" ? readSkillMetadata(content).missing : [];

  // Same rule for JSON, and for the same reason. Half-written JSON is the
  // ordinary state of JSON somebody is editing, and refusing to save it would
  // mean the only way out of a broken file is to lose the work in it.
  const badJson =
    contentType === "json" && content.trim() ? readJson(content) : null;

  async function retype(next: ContentType) {
    const previous = contentType;
    setContentType(next);
    setError(null);

    const res = await fetch(`/api/v1/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content_type: next }),
    });

    // Read it either way. The server says why it refused, which is worth
    // showing instead of a guess, and a response body nobody reads is a stream
    // nobody closes: it left the request hanging open, which is how this
    // surfaced at all.
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setContentType(previous);
      setError(body.error ?? "Could not change the type of this page.");
      return;
    }

    // An empty file becoming HTML or JSON gets that format's starting text, so
    // "make this JSON" does not leave somebody in front of a blank box working
    // out what shape it wants. Anything already written is left exactly alone:
    // changing what a page is is never a way to lose what is in it.
    //
    // Only those two. A skill is Markdown and a blank one is a perfectly good
    // start; it already says what its frontmatter is missing, by name, which
    // teaches the shape better than prefilling half of it and going quiet
    // about the rest.
    const seeded = next === "html" || next === "json";
    if (seeded && !content.trim()) setContent(startingContent(nodeName, next));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setTheirs(null);

    try {
      const res = await fetch(`/api/v1/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, content_version: version }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        // Adopt the new version so a second save from this same editor is not
        // itself treated as stale.
        setVersion(body.node?.content_version ?? version + 1);
        router.push(viewHref);
        router.refresh();
        return;
      }

      setError(body.error ?? `Save failed (${res.status})`);
      // On a conflict the server hands back what is currently stored. The
      // editor keeps the author's text and shows the other version rather
      // than overwriting either.
      if (typeof body.current_content === "string") {
        setTheirs(body.current_content);
      }
    } catch {
      setError("Could not reach the server. Your text is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <h1>{nodeName}</h1>
        <div className="editor-actions">
          <label className="editor-type">
            <span className="field-label">Type</span>
            <select
              className="input input-small"
              value={contentType}
              onChange={(e) => void retype(e.target.value as ContentType)}
            >
              <option value="article">Article</option>
              <option value="skill">Skill</option>
              <option value="html">HTML</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <a className="btn btn-secondary btn-small" href={viewHref}>
            Cancel
          </a>
          <button
            className="btn btn-small"
            type="button"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      ) : null}

      {badJson && !badJson.ok ? (
        <p className="msg msg-warn">
          This is not valid JSON: {badJson.reason}. Saving still works, and the
          page will show the text until it parses.
        </p>
      ) : null}

      {missing.length > 0 ? (
        <p className="msg msg-warn">
          This skill has no {missing.join(" or ")}. Add it to the frontmatter at
          the top so a client can tell what the skill is for. Saving still
          works.
        </p>
      ) : null}

      <textarea
        className="editor-area"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        // Named by what is actually in the box. A screen reader announcing
        // "Markdown source" over a JSON file is a small lie that costs
        // somebody a minute working out which of the two is wrong.
        aria-label={`${SOURCE_LABEL[contentType]} for ${nodeName}`}
      />

      {theirs !== null ? (
        <section className="editor-theirs">
          <h2>Currently saved version</h2>
          <pre>{theirs}</pre>
        </section>
      ) : null}
    </div>
  );
}

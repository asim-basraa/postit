/**
 * A JSON document, read.
 *
 * Invalid JSON is an answer rather than a failure: a file somebody is halfway
 * through writing still has to open, and still has to show them what they have.
 * So the reason is carried alongside the text and the viewer shows both.
 */
export type JsonDocument =
  | { ok: true; value: JsonValue; pretty: string }
  | { ok: false; reason: string };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Parses a stored JSON file.
 *
 * The pretty-printed form is produced here rather than in the viewer so that
 * what is shown and what is copied are the same string, and so the indentation
 * is decided in one place.
 */
export function readJson(source: string): JsonDocument {
  const text = source.trim();

  if (!text) {
    return { ok: false, reason: "This file is empty." };
  }

  try {
    const value = JSON.parse(text) as JsonValue;
    return { ok: true, value, pretty: JSON.stringify(value, null, 2) };
  } catch (error) {
    // The browser's own message names the position, which is the one piece of
    // information that turns "invalid" into something a person can act on.
    const reason = error instanceof Error ? error.message : "Invalid JSON.";
    return { ok: false, reason };
  }
}

/** What to call a value in the viewer: the words a person would use. */
export function describeJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.length === 1 ? "1 item" : `${value.length} items`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).length;
    return keys === 1 ? "1 key" : `${keys} keys`;
  }
  return "";
}

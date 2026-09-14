import { readJson, describeJson, type JsonValue } from "@postit/renderer";

/**
 * Past this, the tree stops being the easier thing to read.
 *
 * A hundred thousand characters of JSON is a data file rather than a document,
 * and drawing a row for every leaf of one costs more than it returns. The text
 * is still all there, which is the part that matters.
 */
const TREE_LIMIT = 100_000;

/** How deep the tree arrives open. Enough to see the shape, not the contents. */
const OPEN_TO = 2;

/**
 * A stored JSON file, shown as its structure.
 *
 * Collapsing is done with `details`, so folding a branch needs no JavaScript
 * and works on a page rendered on the server. The raw text is kept at the
 * bottom rather than replaced by the tree: the tree is for reading, the text is
 * for copying, and a viewer that loses the second is worse than no viewer.
 */
export function JsonView({ source }: { source: string }) {
  const doc = readJson(source);

  if (!doc.ok) {
    return (
      <div className="json-view">
        {/* Advisory, like everything else that judges what somebody wrote. The
            file opens, the reason is named, and what is stored is shown
            unchanged underneath. */}
        <p className="msg msg-warn" role="status">
          This is not valid JSON: {doc.reason}. What is stored is below,
          exactly as it is.
        </p>
        <pre className="json-raw">{source}</pre>
      </div>
    );
  }

  if (doc.pretty.length > TREE_LIMIT) {
    return (
      <div className="json-view">
        <p className="hint">
          This file is too large to lay out as a tree, so it is shown as text.
        </p>
        <pre className="json-raw">{doc.pretty}</pre>
      </div>
    );
  }

  return (
    <div className="json-view">
      <Value value={doc.value} depth={0} />

      <details className="json-source">
        <summary>Raw JSON</summary>
        <pre className="json-raw">{doc.pretty}</pre>
      </details>
    </div>
  );
}

/** One value, which is either a leaf or a branch with rows beneath it. */
function Value({
  name,
  value,
  depth,
}: {
  name?: string;
  value: JsonValue;
  depth: number;
}) {
  const branch = value !== null && typeof value === "object";

  if (!branch) {
    return (
      <div className="json-row">
        <Key name={name} />
        <Leaf value={value} />
      </div>
    );
  }

  const entries: [string, JsonValue][] = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);

  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];

  return (
    <details className="json-branch" open={depth < OPEN_TO}>
      <summary className="json-row">
        <Key name={name} />
        <span className="json-punct">{open}</span>
        <span className="json-count">{describeJson(value)}</span>
        <span className="json-punct">{close}</span>
      </summary>

      {entries.length === 0 ? (
        <p className="json-empty">Nothing in here.</p>
      ) : (
        <div className="json-children">
          {entries.map(([key, child]) => (
            <Value key={key} name={key} value={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </details>
  );
}

function Key({ name }: { name?: string }) {
  if (name === undefined) return null;
  return (
    <>
      <span className="json-key">{name}</span>
      <span className="json-punct">:</span>
    </>
  );
}

/**
 * A leaf, with its type said in colour rather than in words.
 *
 * A string is quoted here and nowhere else, which is what keeps `"12"` and `12`
 * distinguishable in a file where the difference is usually the bug.
 */
function Leaf({ value }: { value: JsonValue }) {
  if (typeof value === "string") {
    return <span className="json-string">&quot;{value}&quot;</span>;
  }
  if (typeof value === "number") {
    return <span className="json-number">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="json-boolean">{String(value)}</span>;
  }
  return <span className="json-null">null</span>;
}

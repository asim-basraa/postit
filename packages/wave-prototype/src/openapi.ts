import { parse as parseYaml } from "yaml";

/**
 * The mock API a prototype runs against: an OpenAPI 3 document, plus optional
 * mock files (one JSON body per operation, named by operationId).
 *
 * Wave reads a few extensions on each operation to connect the API to the
 * screens' data-wave-* attributes:
 *
 *   x-wave-provides: user            the response body is the data root "user",
 *                                    so data-wave-bind="user/firstName" reads it
 *   x-wave-effect: api/orders/place  called when an action names this effect
 *   x-wave-delay: 600                milliseconds before the mock answers
 *
 * Everything else is ordinary OpenAPI: responses with example or examples,
 * parameters with example values, servers[0].url as the base address.
 */

export type ApiResponse = {
  status: number;
  /** A name for choosing it in the prototype: the example's name, or the status. */
  name: string;
  description: string;
  body: unknown;
};

export type ApiOperation = {
  /** operationId, or one made from the method and path. */
  id: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  /** The OpenAPI path, e.g. /orders/{orderId}. */
  path: string;
  summary: string;
  provides: string[];
  effects: string[];
  delay: number | null;
  /** Path parameters with the example values to fill them from. */
  params: { name: string; example: string }[];
  /** Every response with a body to serve, success first. */
  responses: ApiResponse[];
};

export type PrototypeApi = {
  title: string;
  /** Where the API lives: absolute, or a path on the prototype's own origin. */
  base: string;
  operations: ApiOperation[];
};

export type ApiProblem = { level: "error" | "warning"; message: string };

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads an OpenAPI document written as JSON or YAML. */
export function parseApiDocument(text: string): { ok: true; doc: Obj } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "The OpenAPI document is empty." };
  let value: unknown;
  try {
    value = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(trimmed);
  } catch (e) {
    return { ok: false, error: `The OpenAPI document is not valid ${trimmed.startsWith("{") ? "JSON" : "YAML"}: ${(e as Error).message}` };
  }
  if (!isObj(value)) return { ok: false, error: "The OpenAPI document must be an object." };
  if (typeof value.openapi !== "string" || !/^3\./.test(value.openapi)) {
    return { ok: false, error: 'Only OpenAPI 3 is supported: the document needs "openapi": "3.x".' };
  }
  if (!isObj(value.paths)) return { ok: false, error: "The OpenAPI document has no paths." };
  return { ok: true, doc: value };
}

/** Follows a local $ref (#/components/...) once or more. */
function deref(doc: Obj, node: Json | undefined, depth = 0): Json | undefined {
  if (!isObj(node) || typeof node.$ref !== "string" || depth > 10) return node;
  const ref = node.$ref;
  if (!ref.startsWith("#/")) return undefined;
  let cur: Json | undefined = doc;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    cur = isObj(cur) ? cur[key] : undefined;
  }
  return deref(doc, cur, depth + 1);
}

/** An example body made from a schema, for operations with a schema but no example. */
export function exampleFromSchema(doc: Obj, schema: Json | undefined, depth = 0): unknown {
  const s = deref(doc, schema);
  if (!isObj(s) || depth > 8) return null;
  if ("example" in s) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if ("default" in s) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  const all = Array.isArray(s.allOf) ? s.allOf : null;
  if (all) return Object.assign({}, ...all.map((x) => exampleFromSchema(doc, x, depth + 1)).filter(isObj));
  const one = Array.isArray(s.oneOf) ? s.oneOf[0] : Array.isArray(s.anyOf) ? s.anyOf[0] : null;
  if (one) return exampleFromSchema(doc, one, depth + 1);
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (type === "object" || isObj(s.properties)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(isObj(s.properties) ? s.properties : {})) out[k] = exampleFromSchema(doc, v, depth + 1);
    return out;
  }
  if (type === "array") return [exampleFromSchema(doc, s.items, depth + 1)];
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "string") {
    if (s.format === "date-time") return "2026-01-01T09:00:00Z";
    if (s.format === "date") return "2026-01-01";
    if (s.format === "email") return "name@example.com";
    return "";
  }
  return null;
}

const listOf = (v: Json | undefined): string[] =>
  typeof v === "string" ? v.split(/[\s,]+/).filter(Boolean) : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The document as the prototype serves it. Mock files (by operationId, any
 * case) replace the body of the operation's first success response.
 */
export function readApi(doc: Obj, mocks: Record<string, unknown> = {}): { api: PrototypeApi; problems: ApiProblem[] } {
  const problems: ApiProblem[] = [];
  const mockBySlug = new Map(Object.entries(mocks).map(([k, v]) => [slug(k), v]));
  const usedMocks = new Set<string>();
  const operations: ApiOperation[] = [];
  const ids = new Set<string>();

  for (const [path, rawItem] of Object.entries(isObj(doc.paths) ? doc.paths : {})) {
    const item = deref(doc, rawItem);
    if (!isObj(item)) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const op = deref(doc, item[method]);
      if (!isObj(op)) continue;
      let id = typeof op.operationId === "string" && op.operationId.trim() ? op.operationId.trim() : `${method}${path.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ""))}`;
      if (ids.has(id)) {
        problems.push({ level: "warning", message: `Two operations are called ${id}; the second is ${method.toUpperCase()} ${path}.` });
        id = `${id}_${method}`;
      }
      ids.add(id);

      const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]
        .map((p) => deref(doc, p))
        .filter(isObj)
        .filter((p) => p.in === "path" && typeof p.name === "string")
        .map((p) => {
          const ex = p.example ?? (isObj(p.examples) ? Object.values(p.examples).map((e) => (isObj(deref(doc, e)) ? (deref(doc, e) as Obj).value : undefined)).find((v) => v !== undefined) : undefined) ?? exampleFromSchema(doc, p.schema);
          return { name: p.name as string, example: ex === null || ex === undefined || ex === "" ? "1" : String(ex) };
        });

      const responses: ApiResponse[] = [];
      for (const [code, rawRes] of Object.entries(isObj(op.responses) ? op.responses : {})) {
        const status = code === "default" ? 500 : Number(code.replace(/X/gi, "0"));
        if (!Number.isInteger(status) || status < 100 || status > 599) continue;
        const res = deref(doc, rawRes);
        if (!isObj(res)) continue;
        const description = typeof res.description === "string" ? res.description : "";
        const content = isObj(res.content) ? res.content : {};
        const media = deref(doc, content["application/json"] ?? Object.values(content)[0]);
        if (!isObj(media)) {
          responses.push({ status, name: String(status), description, body: null });
          continue;
        }
        const examples = isObj(media.examples) ? Object.entries(media.examples) : [];
        if (examples.length) {
          for (const [name, rawEx] of examples) {
            const ex = deref(doc, rawEx);
            responses.push({ status, name: examples.length > 1 || status >= 300 ? `${status} ${name}` : String(status), description: (isObj(ex) && typeof ex.summary === "string" ? ex.summary : "") || description, body: isObj(ex) ? ex.value ?? null : null });
          }
        } else if ("example" in media) {
          responses.push({ status, name: String(status), description, body: media.example });
        } else {
          responses.push({ status, name: String(status), description, body: exampleFromSchema(doc, media.schema) });
        }
      }
      responses.sort((a, b) => Number(a.status >= 300) - Number(b.status >= 300) || a.status - b.status);

      const mock = mockBySlug.get(slug(id)) ?? (typeof op["x-wave-mock"] === "string" ? mockBySlug.get(slug(op["x-wave-mock"] as string)) : undefined);
      if (mock !== undefined) {
        usedMocks.add(slug(id));
        if (typeof op["x-wave-mock"] === "string") usedMocks.add(slug(op["x-wave-mock"] as string));
        const ok = responses.find((r) => r.status < 300);
        if (ok) ok.body = mock;
        else responses.unshift({ status: 200, name: "200", description: "From the mock file", body: mock });
      }
      if (!responses.length) {
        problems.push({ level: "warning", message: `${method.toUpperCase()} ${path} has no responses; the prototype answers 204.` });
        responses.push({ status: 204, name: "204", description: "", body: null });
      }

      const delay = typeof op["x-wave-delay"] === "number" ? Math.max(0, Math.min(10000, op["x-wave-delay"] as number)) : null;
      operations.push({
        id,
        method,
        path,
        summary: typeof op.summary === "string" ? op.summary : "",
        provides: listOf(op["x-wave-provides"]),
        effects: listOf(op["x-wave-effect"]),
        delay,
        params,
        responses,
      });
    }
  }

  for (const name of mockBySlug.keys()) {
    if (!usedMocks.has(name)) problems.push({ level: "warning", message: `The mock file ${name} matches no operationId.` });
  }

  const info = isObj(doc.info) ? doc.info : {};
  const servers = Array.isArray(doc.servers) ? doc.servers : [];
  const first = isObj(servers[0]) && typeof servers[0].url === "string" ? (servers[0].url as string) : "/api";
  return {
    api: { title: typeof info.title === "string" ? info.title : "API", base: first.replace(/\/$/, "") || "", operations },
    problems,
  };
}

/** The operation that serves a data root, if any. GET operations are preferred. */
export function providerOf(api: PrototypeApi, root: string): ApiOperation | null {
  const all = api.operations.filter((o) => o.provides.includes(root));
  return all.find((o) => o.method === "get") ?? all[0] ?? null;
}

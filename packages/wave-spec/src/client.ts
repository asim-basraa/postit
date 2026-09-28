/**
 * The parts of the spec a browser needs, without the HTML parser.
 *
 * The review screen matches values to tokens, reads destinations and knows the
 * vocabulary; none of that needs parse5, which would otherwise ride along into
 * every page that imports from the package root.
 */
export * from "./vocabulary";
export * from "./destination";
export { normaliseValue, normaliseColor, normaliseLength, cssVarFor, tokenGroup } from "./tokens";
export type { Token } from "./tokens";
export { nearDuplicates, slugify } from "./flow";

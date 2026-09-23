import { gzipSync } from "node:zlib";

/**
 * Just enough tar to hand somebody a folder.
 *
 * Written rather than depended on, because what is needed here is the oldest
 * and simplest part of the format: a few hundred bytes of fixed-width header
 * per file and nothing else. The alternative was a dependency whose surface is
 * almost entirely extraction, symlinks, sparse files and permission handling —
 * none of which this produces and all of which it would have to be trusted not
 * to.
 *
 * ustar specifically, which is what every extractor on every platform reads.
 */

export type TarEntry = { path: string; body: string };

const BLOCK = 512;

/**
 * The longest path this writer will emit.
 *
 * ustar splits a long name across a 155-byte prefix and a 100-byte name, and
 * implementing that split is a way to get it subtly wrong. Callers keep names
 * short instead, which for a skill folder is no hardship, and anything longer
 * is refused loudly rather than truncated into a file somebody cannot find.
 */
export const MAX_PATH = 100;

/** A gzipped tar of these files, ready to serve. */
export function tarball(entries: TarEntry[]): Buffer {
  return gzipSync(tar(entries));
}

export function tar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];

  // Parent directories, once each and in the order they first appear. Most
  // extractors would create them anyway; the strict ones will not, and a tar
  // that unpacks everywhere is the point of using this format at all.
  const made = new Set<string>();
  for (const entry of entries) {
    const segments = entry.path.split("/");
    segments.pop();
    let prefix = "";
    for (const segment of segments) {
      prefix += `${segment}/`;
      if (made.has(prefix)) continue;
      made.add(prefix);
      parts.push(header(prefix, 0, "5"));
    }

    const body = Buffer.from(entry.body, "utf8");
    parts.push(header(entry.path, body.length, "0"), body, padding(body.length));
  }

  // Two zero blocks end the archive. Without them an extractor reads past the
  // last file looking for another header and reports a truncated file.
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

function padding(size: number): Buffer {
  const over = size % BLOCK;
  return over === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - over);
}

/**
 * One 512-byte ustar header.
 *
 * The checksum is the awkward part and the reason this is worth a comment: it
 * is the sum of every byte in the header, computed while the checksum field
 * itself reads as eight spaces, and then written into that field. Get the
 * order wrong and every extractor rejects the archive as corrupt.
 */
function header(path: string, size: number, type: "0" | "5"): Buffer {
  if (Buffer.byteLength(path, "utf8") > MAX_PATH) {
    throw new Error(`Path too long for a tar entry: ${path}`);
  }

  const block = Buffer.alloc(BLOCK);
  block.write(path, 0, 100, "utf8");
  // Readable and writable by its owner, readable by everybody else, which is
  // what an extractor should leave on disk. Directories need the execute bit
  // or nobody can enter them.
  block.write(type === "5" ? "0000755\0" : "0000644\0", 100, 8, "ascii");
  block.write("0000000\0", 108, 8, "ascii"); // uid
  block.write("0000000\0", 116, 8, "ascii"); // gid
  block.write(octal(size, 11), 124, 12, "ascii");
  // A fixed timestamp, not now(): the same skillset served twice should be the
  // same bytes, so a client can tell whether anything actually changed.
  block.write(octal(0, 11), 136, 12, "ascii");
  block.write("        ", 148, 8, "ascii"); // checksum, as spaces for now
  block.write(type, 156, 1, "ascii");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");

  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${octal(sum, 6)}\0 `, 148, 8, "ascii");

  return block;
}

/** Zero-padded octal in a fixed width, then a NUL, as the format wants. */
function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width, "0")}\0`;
}

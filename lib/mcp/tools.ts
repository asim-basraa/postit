import { readSkillMetadata, parseFrontmatter } from "@postit/renderer";
import {
  startingContent,
  translate,
  isContentType,
  CONTENT_TYPE_ERROR,
  CONTENT_TYPES,
  type ContentType,
} from "@/lib/nodes";
import {
  readUpload,
  UPLOAD_KINDS,
  ceilingFor,
  MAX_ARTIFACT_BYTES,
} from "@/lib/uploads";
import {
  putArtifact,
  replaceArtifact,
  readArtifact,
  removeArtifact,
} from "@/lib/artifacts";
import { COMMENT_LIMIT } from "@/lib/comments";
import type { McpSession } from "./session";

export type ToolResult = { text: string } | { error: string };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(session: McpSession, args: Record<string, unknown>): Promise<ToolResult>;
};

/**
 * The tools the MCP server offers.
 *
 * Every one of them goes through session.supabase, which carries an access
 * token minted for the token's owner. That means RLS and the can_read family
 * decide what each tool can see, exactly as they do in the browser.
 *
 * **No tool makes an access decision of its own.** A tool that filtered its own
 * results would be a second authorization seam, and a second seam is a seam
 * that eventually disagrees with the first. Where a tool looks like it is
 * filtering, it is scoping: `space_id` narrows a query, it does not decide
 * whether a row may be seen.
 *
 * Nothing destructive ships here. There is no delete_page and no move_page, and
 * no way to change who can see anything. A leaked token that can only add is a
 * far smaller problem than one that can remove, and the web app is a perfectly
 * good place to do the dangerous things deliberately.
 *
 * That rule is about removing and re-permissioning, not about creating.
 * create_folder was missing for a while and it was an oversight rather than a
 * decision: folders are the only thing that can contain anything, so without
 * it no structure could be built here at all, and somebody filing seventeen
 * pages had to choose between a flat list and going to the browser.
 */

function text(value: string): ToolResult {
  return { text: value };
}

/**
 * A name, or the reason it is not one.
 *
 * A slash is the thing people reach for when they mean "put this inside that",
 * because every other tool they have used works that way. Here it is just a
 * character, slugified into a hyphen, so "hybrid-web/README" quietly became one
 * flat page called hybrid-web-readme. Saying so is the whole fix.
 */
function readName(value: unknown): string | { error: string } {
  const name = String(value ?? "").trim();
  if (!name) return { error: "A name is required." };

  if (name.includes("/")) {
    return {
      error:
        "A name cannot contain a slash. Nesting is done with parent_id: make the folder with create_folder, then pass its id here.",
    };
  }

  return name;
}

const listSpaces: ToolDefinition = {
  name: "list_spaces",
  description:
    "List the spaces this token can reach. A space is a top-level collection of pages.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async run(session) {
    let query = session.supabase
      .from("spaces")
      .select("id, slug, name")
      .order("name");

    // Scoping, not filtering: a space-scoped token still cannot see anything
    // its owner could not, RLS having already decided that.
    if (session.spaceId) query = query.eq("id", session.spaceId);

    const { data, error } = await query;
    if (error) return { error: error.message };

    const spaces = (data ?? []) as { id: string; slug: string; name: string }[];
    if (spaces.length === 0) return text("No spaces.");

    return text(
      spaces.map((s) => `- ${s.name} (slug: ${s.slug}, id: ${s.id})`).join("\n"),
    );
  },
};

/**
 * Skillsets, which are spaces whose contents are skills.
 *
 * Separate from list_spaces rather than a flag on it, because the question is
 * a different one: list_spaces asks where somebody's work is kept, this asks
 * what this token could teach an agent to do. Answering both at once would
 * bury a handful of skillsets in a list of project spaces.
 */
const listSkillsets: ToolDefinition = {
  name: "list_skillsets",
  description:
    "List the skillsets this token can reach. A skillset is a space whose contents are skills, in the Agent Skills format. Use list_skills on one to see what is in it.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async run(session) {
    let query = session.supabase
      .from("spaces")
      .select("id, slug, name")
      .eq("is_skillset", true)
      .order("name");

    if (session.spaceId) query = query.eq("id", session.spaceId);

    const { data, error } = await query;
    if (error) return { error: error.message };

    const spaces = (data ?? []) as { id: string; slug: string; name: string }[];
    if (spaces.length === 0) return text("No skillsets.");

    return text(
      spaces.map((s) => `- ${s.name} (slug: ${s.slug}, id: ${s.id})`).join("\n"),
    );
  },
};

const search: ToolDefinition = {
  name: "search",
  description:
    "Full-text search within one space. Only pages this token can read are returned.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string", description: "The space to search." },
      query: { type: "string", description: "What to look for." },
    },
    required: ["space_id", "query"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    const { data, error } = await session.supabase.rpc("search_nodes", {
      p_space_id: spaceId,
      p_query: String(args.query ?? ""),
    });
    if (error) return { error: error.message };

    const hits = (data ?? []) as { name: string; path: string }[];
    if (hits.length === 0) return text("Nothing matched.");

    return text(hits.map((h) => `- ${h.name} (${h.path})`).join("\n"));
  },
};

const readPage: ToolDefinition = {
  name: "read_page",
  description:
    "Read one page by its path within a space, or by id. Returns the source, which is Markdown for an article or a skill and the file itself for an HTML or JSON page. Reading a folder lists what is inside it instead.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      path: { type: "string", description: "For example 'projects/roadmap'." },
      id: { type: "string", description: "Alternative to space_id and path." },
    },
    additionalProperties: false,
  },
  async run(session, args) {
    const node = await findNode(session, args);
    if ("error" in node) return node;

    // A folder has no body, and answering "(no content)" for one is true and
    // useless. What somebody reading a folder wants is what is in it.
    if (node.content_type === null) {
      const { data } = await session.supabase
        .from("nodes")
        .select("name, path, kind, content_type")
        .eq("parent_id", node.id)
        .order("kind")
        .order("name");

      const children = (data ?? []) as {
        name: string;
        path: string;
        kind: string;
        content_type: string | null;
      }[];

      return text(
        [
          `# ${node.name}`,
          `path: ${node.path}`,
          `id: ${node.id}`,
          `type: folder`,
          "",
          children.length === 0
            ? "This folder is empty."
            : children
                .map(
                  (child) =>
                    `- ${child.path} (${child.kind === "folder" ? "folder" : (child.content_type ?? "article")})`,
                )
                .join("\n"),
        ].join("\n"),
      );
    }

    return text(
      [
        `# ${node.name}`,
        `path: ${node.path}`,
        `id: ${node.id}`,
        `type: ${node.content_type}`,
        `version: ${node.content_version}`,
        // Only when there is one. Nearly every page carries no review state at
        // all, and a line saying so on all of them would be noise on the
        // ordinary case to serve the rare one.
        ...(node.review_status ? [`review: ${node.review_status}`] : []),
        ...(node.artifact_token
          ? [`address: /m/${node.artifact_token}`]
          : []),
        "",
        (node.artifact_key ? await readArtifact(node.artifact_key) : node.content) ??
          "(no content)",
      ].join("\n"),
    );
  },
};

const listTree: ToolDefinition = {
  name: "list_tree",
  description:
    "List everything in a space that this token can reach, as paths, with each item's kind and id. This is how you find a folder to put things in, and how you see what structure already exists.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      kind: {
        type: "string",
        enum: ["folder", "file"],
        description: "Optional. Narrow to just folders or just pages.",
      },
    },
    required: ["space_id"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    let query = session.supabase
      .from("nodes")
      .select("id, name, path, kind, content_type")
      .eq("space_id", spaceId)
      .order("path");

    if (args.kind === "folder" || args.kind === "file") {
      query = query.eq("kind", args.kind);
    }

    const { data, error } = await query;
    if (error) return { error: error.message };

    const nodes = (data ?? []) as {
      id: string;
      name: string;
      path: string;
      kind: string;
      content_type: string | null;
    }[];
    if (nodes.length === 0) return text("Nothing here.");

    // Path order is tree order, so this reads as the shape it describes
    // without having to nest anything.
    return text(
      nodes
        .map((node) => {
          const what =
            node.kind === "folder" ? "folder" : (node.content_type ?? "article");
          return `- ${node.path} (${what}, id: ${node.id})`;
        })
        .join("\n"),
    );
  },
};

const listSkills: ToolDefinition = {
  name: "list_skills",
  description:
    "List the skills in a space, with the name and description from each one's frontmatter, so a client can choose which to load.",
  inputSchema: {
    type: "object",
    properties: { space_id: { type: "string" } },
    required: ["space_id"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    const { data, error } = await session.supabase
      .from("nodes")
      .select("id, name, path, content")
      .eq("space_id", spaceId)
      .eq("content_type", "skill")
      .order("name");
    if (error) return { error: error.message };

    const skills = (data ?? []) as {
      id: string;
      name: string;
      path: string;
      content: string | null;
    }[];
    if (skills.length === 0) return text("No skills in this space.");

    return text(
      skills
        .map((skill) => {
          const meta = readSkillMetadata(skill.content ?? "");
          const label = meta.name ?? skill.name;
          const description = meta.description ?? "(no description)";
          return `- ${label}: ${description} (path: ${skill.path})`;
        })
        .join("\n"),
    );
  },
};

const getSkill: ToolDefinition = {
  name: "get_skill",
  description:
    "Fetch one skill's full Markdown, ready to follow. Takes the same arguments as read_page.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      path: { type: "string" },
      id: { type: "string" },
    },
    additionalProperties: false,
  },
  async run(session, args) {
    const node = await findNode(session, args);
    if ("error" in node) return node;

    if (node.content_type !== "skill") {
      return { error: `${node.name} is not a skill.` };
    }

    // The body without the metadata block: the frontmatter has already been
    // read to decide this skill was worth loading, and repeating it wastes the
    // reader's attention.
    const { body } = parseFrontmatter(node.content ?? "");
    return text(body.trim());
  },
};

const createFolder: ToolDefinition = {
  name: "create_folder",
  description:
    "Create a folder in a space, optionally inside another folder. Folders are the only thing that can contain other items, so building any structure starts here.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      name: { type: "string" },
      parent_id: {
        type: "string",
        description: "Optional folder to create it in. Must be a folder.",
      },
    },
    required: ["space_id", "name"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    const name = readName(args.name);
    if (typeof name !== "string") return name;

    const id = crypto.randomUUID();

    const { error } = await session.supabase.from("nodes").insert({
      id,
      space_id: spaceId,
      parent_id: typeof args.parent_id === "string" ? args.parent_id : null,
      kind: "folder",
      name,
    });

    if (error) return { error: translate(error).error };

    const { data } = await session.supabase
      .from("nodes")
      .select("id, name, path")
      .eq("id", id)
      .maybeSingle();

    // The same shape create_page answers in, so a client that has learned to
    // read one has learned to read both.
    return text(
      data
        ? `Created folder ${name} at ${(data as { path: string }).path} (id: ${id}).`
        : `Created folder ${name}.`,
    );
  },
};

/**
 * Makes a page, wherever its bytes belong.
 *
 * Both doors into this file were writing the same insert with one difference,
 * and the difference — that an HTML page's bytes are a file rather than a
 * column — is exactly the kind that gets added to one copy and not the other.
 * A create_page that missed it produced a page pointing at nothing, which is
 * worse than a refusal because it looks like it worked.
 */
async function insertPage(
  session: McpSession,
  page: {
    spaceId: string;
    parentId: string | null;
    name: string;
    contentType: ContentType;
    content: string;
  },
): Promise<{ id: string; path: string } | { error: string }> {
  const artifact =
    page.contentType === "html" ? await putArtifact(page.content) : null;
  if (page.contentType === "html" && !artifact) {
    return { error: "Could not store that file." };
  }

  const id = crypto.randomUUID();
  const { error } = await session.supabase.from("nodes").insert({
    id,
    space_id: page.spaceId,
    parent_id: page.parentId,
    kind: "file",
    name: page.name,
    content_type: page.contentType,
    content: artifact ? null : page.content,
    artifact_key: artifact?.key ?? null,
    artifact_token: artifact?.token ?? null,
  });

  if (error) {
    // Nothing points at it, so it is rubbish rather than a leak, and leaving
    // rubbish in a bucket is still worse than not.
    if (artifact) await removeArtifact(artifact.key);
    return { error: translate(error).error };
  }

  const { data } = await session.supabase
    .from("nodes")
    .select("id, path")
    .eq("id", id)
    .maybeSingle();

  const made = data as { id: string; path: string } | null;
  return made ?? { id, path: page.name };
}

const createPage: ToolDefinition = {
  name: "create_page",
  description:
    "Create a new page in a space. Returns its id and path. Cannot overwrite an existing page.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      name: { type: "string" },
      parent_id: { type: "string", description: "Optional folder to create it in." },
      content_type: {
        type: "string",
        enum: [...CONTENT_TYPES],
        description:
          "article and skill are Markdown; html is a static HTML document, shown without scripts; json is a data file, shown as a tree.",
      },
      content: { type: "string", description: "Optional body, in whatever the content_type says." },
    },
    required: ["space_id", "name"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    const name = readName(args.name);
    if (typeof name !== "string") return name;

    // Named rather than quietly corrected. Passing "folder" here used to
    // produce an article, which reads as the call having worked and leaves
    // somebody wondering why their folder cannot hold anything.
    if (args.content_type === "folder") {
      return {
        error:
          "A folder is not a kind of page. Use create_folder to make one, then pass its id as parent_id here.",
      };
    }
    if (args.content_type !== undefined && !isContentType(args.content_type)) {
      return { error: CONTENT_TYPE_ERROR };
    }

    const contentType = isContentType(args.content_type)
      ? args.content_type
      : "article";

    const created = await insertPage(session, {
      spaceId,
      parentId: typeof args.parent_id === "string" ? args.parent_id : null,
      name,
      contentType,
      // The same starting text the browser uses. Two copies of this had already
      // drifted: one seeded a heading the other had stopped seeding.
      content:
        typeof args.content === "string"
          ? args.content
          : startingContent(name, contentType),
    });

    if ("error" in created) return created;

    return text(`Created ${name} at ${created.path} (id: ${created.id}).`);
  },
};

const updatePage: ToolDefinition = {
  name: "update_page",
  description:
    "Replace a page's contents. Requires the version returned by read_page, and refuses if somebody else has saved since.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      content: { type: "string" },
      version: {
        type: "number",
        description: "The version from read_page. Guards against clobbering.",
      },
    },
    required: ["id", "content", "version"],
    additionalProperties: false,
  },
  async run(session, args) {
    const id = String(args.id ?? "");
    const content = String(args.content ?? "");
    const version = Number(args.version);

    if (!id || !Number.isFinite(version)) {
      return { error: "id, content and version are all required." };
    }

    // Where the bytes belong is decided by where they already are. The row is
    // written either way and the row carries the version, so the guard against
    // clobbering somebody's edit is unchanged. Without this, saving an HTML
    // page through here wrote the text into a column nothing reads and left
    // the file serving the old version — which looks exactly like it worked.
    const { data: existing } = await session.supabase
      .from("nodes")
      .select("artifact_key")
      .eq("id", id)
      .maybeSingle();

    const key = (existing as { artifact_key: string | null } | null)
      ?.artifact_key;

    const { data, error } = await session.supabase
      .from("nodes")
      .update({
        content: key ? null : content,
        content_version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("content_version", version)
      .select("id, name, content_version")
      .maybeSingle();

    if (error) return { error: error.message };

    // After the row, never before: the row is what says this caller may write
    // here at all, and a refused save must leave the file alone.
    if (data && key && !(await replaceArtifact(key, content))) {
      return { error: "The page was saved but its file could not be written." };
    }

    if (!data) {
      // No row matched, which is either a stale version or no access. Reading
      // it back disambiguates, exactly as the web editor does.
      const { data: current } = await session.supabase
        .from("nodes")
        .select("content_version")
        .eq("id", id)
        .maybeSingle();

      if (!current) return { error: "Not found." };

      return {
        error: `Someone else saved this page. It is now at version ${
          (current as { content_version: number }).content_version
        }. Read it again before writing.`,
      };
    }

    const saved = data as { name: string; content_version: number };
    return text(`Saved ${saved.name}, now at version ${saved.content_version}.`);
  },
};

/**
 * Bringing in a file that already exists.
 *
 * The same act as Upload in the browser, and the same rules: the extension
 * decides what kind of page it becomes, the page is named after the file
 * without it, and nothing but Markdown, HTML and JSON is taken. Those rules
 * live in one module so the two doors cannot drift apart.
 *
 * Separate from create_page rather than a flag on it, because what is being
 * described is different: create_page is handed a name and a body, this is
 * handed a file. An agent that has just produced `report.html` should not have
 * to work out which content_type that implies.
 */
const attachFile: ToolDefinition = {
  name: "attach_file",
  description:
    "Add a file to a space as a page, taking its kind from the filename. Markdown becomes an article, .html a static HTML page shown without scripts, .json a data page shown as a tree. Use this when you have a file; use create_page when you have a name and a body. For a file too large to pass in one call, send the first part here and the rest with append_to_page, in order.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      filename: {
        type: "string",
        description:
          "With its extension, for example 'Quarterly Report.html'. The page is named after it without the extension.",
      },
      content: { type: "string", description: "The whole file, as text." },
      parent_id: {
        type: "string",
        description: "Optional folder to put it in. Must be a folder.",
      },
    },
    required: ["space_id", "filename", "content"],
    additionalProperties: false,
  },
  async run(session, args) {
    const spaceId = requireSpace(session, args.space_id);
    if (typeof spaceId !== "string") return spaceId;

    const filename = String(args.filename ?? "").trim();
    if (!filename) return { error: "A filename is required." };

    const content = String(args.content ?? "");
    const bytes = new TextEncoder().encode(content).length;

    const upload = readUpload(filename, bytes);
    if (!upload.ok) return { error: upload.error };

    // Said again here rather than trusted from above: the browser checks the
    // size before sending and this door has no browser in front of it.
    if (bytes > ceilingFor(upload.contentType)) {
      return {
        error: `That file is ${Math.round(bytes / 1000)}kB, which is more than a ${upload.contentType} page can hold.`,
      };
    }

    const name = readName(upload.name);
    if (typeof name !== "string") return name;

    const made = await insertPage(session, {
      spaceId,
      parentId: typeof args.parent_id === "string" ? args.parent_id : null,
      name,
      contentType: upload.contentType,
      content,
    });

    if ("error" in made) return made;

    return text(
      `Added ${name} as ${upload.contentType} at ${made.path} (id: ${made.id}).`,
    );
  },
};

/**
 * The rest of a file, when it did not fit in one call.
 *
 * The limit this exists for is the caller's, not the server's: a client that
 * can hold half a megabyte of HTML in memory still cannot put it in a single
 * tool argument. The answer everybody reaches for is a signed URL and a direct
 * POST, which means a second door onto this data with its own authentication
 * and its own allowlist to get added to. This is the same door, used more than
 * once, and it needs nothing new to be true about the network.
 *
 * Each call is an ordinary save, so each leaves a revision and the history
 * reads as the file arriving in the order it arrived.
 */
const appendToPage: ToolDefinition = {
  name: "append_to_page",
  description:
    "Add text to the end of a page. For a file too large to pass in one call: create it with attach_file and the first part, then append the rest in order. Answers with the size of the page so far, in bytes. No version is needed — appends land one after another rather than on top of each other.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The page, as returned by attach_file." },
      content: { type: "string", description: "The next part, added exactly as given." },
    },
    required: ["id", "content"],
    additionalProperties: false,
  },
  async run(session, args) {
    const id = String(args.id ?? "");
    if (!id) return { error: "id is required." };

    const addition = String(args.content ?? "");

    // A page whose bytes are a file is grown by reading, adding and writing
    // back. The row is touched first and through the ordinary policy, so who
    // may do this is still decided in exactly one place.
    const { data: node } = await session.supabase
      .from("nodes")
      .select("artifact_key")
      .eq("id", id)
      .maybeSingle();

    const key = (node as { artifact_key: string | null } | null)?.artifact_key;

    if (key) {
      // The row, through the ordinary policy, and it is the row that says
      // whether this caller may write here. A refusal matches no row and
      // raises nothing, so the row coming back is the check — not the absence
      // of an error, which would have let a reader grow somebody's file.
      const { data: allowed, error: failed } = await session.supabase
        .from("nodes")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (failed) return { error: failed.message };
      if (!allowed) return { error: "Not found." };

      const current = await readArtifact(key);
      if (current === null) return { error: "Not found." };

      const grown = current + addition;
      if (new TextEncoder().encode(grown).length > MAX_ARTIFACT_BYTES) {
        return {
          error: `That would take the file past ${Math.round(MAX_ARTIFACT_BYTES / 1_000_000)}MB, which is as much as one can hold.`,
        };
      }
      if (!(await replaceArtifact(key, grown))) {
        return { error: "Could not write to that file." };
      }

      return text(`Added. The file is now ${grown.length} bytes.`);
    }

    const { data, error } = await session.supabase.rpc("append_to_node", {
      p_node_id: id,
      p_text: addition,
    });

    if (error) {
      // The database wrote these to be read by whoever tried, so they travel
      // as they are rather than as a code.
      return { error: error.message.replace(/^.*?:\s*/, "") };
    }

    return text(`Added. The page is now ${Number(data)} bytes.`);
  },
};

/**
 * The review flow, from here.
 *
 * Three tools rather than one with a mode, because they are three different
 * acts and two of them belong to different people. Every rule is the
 * database's, which is the point: a token carries its owner's authority and no
 * more, so approving through one is that person approving. The tool says so,
 * because an agent asked to "tidy up the docs" should not conclude that
 * approving them is part of tidying.
 *
 * Nothing here grants anybody anything. A review state is a label on a
 * document; it moves nothing about who can read it.
 */
function reviewTool(
  name: string,
  description: string,
  status: "in_review" | "approved" | null,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string" },
        path: { type: "string", description: "For example 'proposals/pricing'." },
        id: { type: "string", description: "Alternative to space_id and path." },
      },
      additionalProperties: false,
    },
    async run(session, args) {
      const node = await findNode(session, args);
      if ("error" in node) return node;

      const { error } = await session.supabase.rpc("set_review_status", {
        p_node_id: node.id,
        p_status: status,
      });

      if (error) {
        // The database wrote these sentences to be read by whoever tried, and
        // an agent relaying one verbatim is more use than a code.
        return { error: error.message.replace(/^.*?:\s*/, "") };
      }

      if (status === "in_review") {
        return text(`${node.name} is under review.`);
      }
      if (status === "approved") return text(`Approved ${node.name}.`);
      return text(`${node.name} is no longer in review.`);
    },
  };
}

const askForReview = reviewTool(
  "ask_for_review",
  "Put a page under review, which is what its author does when they want somebody to look at it. Needs the same access as editing the page. Most pages never go through this; it is opt-in.",
  "in_review",
);

const approvePage = reviewTool(
  "approve_page",
  "Approve a page that is under review. Anybody in the space it lives in may do this, and through a token that means its owner is approving it: a judgement about the document, made in their name. Do not use it unless you were asked to approve this page.",
  "approved",
);

const clearReview = reviewTool(
  "clear_review",
  "Take a page out of the review flow, whether it was under review or approved, leaving it with no status at all. Needs the same access as editing the page.",
  null,
);

const listBacklinks: ToolDefinition = {
  name: "list_backlinks",
  description:
    "Pages that link to a given page. Only sources this token can read are listed.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      path: { type: "string" },
      id: { type: "string" },
    },
    additionalProperties: false,
  },
  async run(session, args) {
    const node = await findNode(session, args);
    if ("error" in node) return node;

    const { data: rows } = await session.supabase
      .from("links")
      .select("source_node_id")
      .eq("target_node_id", node.id);

    const sources = ((rows ?? []) as { source_node_id: string }[]).map(
      (r) => r.source_node_id,
    );
    if (sources.length === 0) return text("Nothing links here.");

    const { data } = await session.supabase
      .from("nodes")
      .select("name, path")
      .in("id", sources)
      .order("name");

    const links = (data ?? []) as { name: string; path: string }[];
    if (links.length === 0) return text("Nothing links here.");

    return text(links.map((l) => `- ${l.name} (${l.path})`).join("\n"));
  },
};

/**
 * The two comment tools.
 *
 * Reading a page is enough to comment on it, which is the rule the table
 * already carries: a reader who spots a mistake can say so without being given
 * the power to edit. Nothing here restates that. The insert is an ordinary one
 * and the policy decides.
 *
 * There is no way to reply, and that is the design rather than an omission. An
 * agent's job here is to leave one considered review as one comment; the
 * conversation underneath it belongs to the people on the page, who can see
 * each other and answer in their own words. An agent that could also reply
 * would end up talking in a thread meant for them, and a comment box filling
 * with machine answers stops being somewhere anybody wants to write.
 *
 * Reading still shows replies, because a review written without reading the
 * discussion is a review of the wrong thing.
 */
const listComments: ToolDefinition = {
  name: "list_comments",
  description:
    "The comments on a page, oldest first, with who wrote each one. Replies appear under the comment they answer.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      path: { type: "string", description: "For example 'projects/roadmap'." },
      id: { type: "string", description: "Alternative to space_id and path." },
    },
    additionalProperties: false,
  },
  async run(session, args) {
    const node = await findNode(session, args);
    if ("error" in node) return node;

    const { data, error } = await session.supabase.rpc("node_comments", {
      p_node_id: node.id,
    });

    if (error) return { error: "Not found." };

    const rows = (data ?? []) as {
      id: string;
      parent_id: string | null;
      author_email: string;
      body: string;
      created_at: string;
      deleted: boolean;
    }[];

    if (rows.length === 0) return text(`No comments on ${node.name} yet.`);

    const repliesTo = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.parent_id) continue;
      const kept = repliesTo.get(row.parent_id);
      if (kept) kept.push(row);
      else repliesTo.set(row.parent_id, [row]);
    }

    const render = (row: (typeof rows)[number], indent: string) =>
      [
        `${indent}${row.author_email} · ${row.created_at}`,
        `${indent}${row.deleted ? "(withdrawn)" : row.body.replace(/\n/g, `\n${indent}`)}`,
      ].join("\n");

    const lines: string[] = [`# Comments on ${node.name}`, ""];
    for (const row of rows) {
      if (row.parent_id) continue;
      lines.push(render(row, ""));
      for (const reply of repliesTo.get(row.id) ?? []) {
        lines.push(render(reply, "    "));
      }
      lines.push("");
    }

    return text(lines.join("\n").trimEnd());
  },
};

const addComment: ToolDefinition = {
  name: "add_comment",
  description:
    "Add a comment to a page. Top level only: leave a whole review as a single comment, and let the people on the page reply to it themselves. Being able to read the page is enough; it does not require permission to edit.",
  inputSchema: {
    type: "object",
    properties: {
      space_id: { type: "string" },
      path: { type: "string", description: "For example 'projects/roadmap'." },
      id: { type: "string", description: "Alternative to space_id and path." },
      body: {
        type: "string",
        description:
          "The comment, as Markdown. One comment, however long: do not split a review across several.",
      },
    },
    required: ["body"],
    additionalProperties: false,
  },
  async run(session, args) {
    const node = await findNode(session, args);
    if ("error" in node) return node;

    const body = String(args.body ?? "").trim();
    if (!body) return { error: "A comment cannot be empty." };
    if (body.length > COMMENT_LIMIT) {
      return { error: `Keep a comment under ${COMMENT_LIMIT} characters.` };
    }

    // author_id is the token's owner, and the insert policy independently
    // requires it to match the session. A token cannot post as somebody else
    // even if this line were wrong.
    const { error } = await session.supabase.from("comments").insert({
      node_id: node.id,
      author_id: session.userId,
      parent_id: null,
      body,
    });

    // Not-found rather than forbidden, like everything else here: a refusal
    // must not tell a token which pages exist.
    if (error) return { error: "Not found." };

    return text(`Commented on ${node.name}.`);
  },
};

export const TOOLS: ToolDefinition[] = [
  listSpaces,
  search,
  listTree,
  readPage,
  listSkillsets,
  listSkills,
  getSkill,
  createFolder,
  createPage,
  attachFile,
  appendToPage,
  updatePage,
  askForReview,
  approvePage,
  clearReview,
  listBacklinks,
  listComments,
  addComment,
];

type FoundNode = {
  id: string;
  name: string;
  path: string;
  content: string | null;
  content_version: number;
  content_type: ContentType | null;
  review_status: "in_review" | "approved" | null;
  artifact_key: string | null;
  artifact_token: string | null;
};

/**
 * Looks a node up by id, or by path within a space.
 *
 * RLS decides whether it is visible, so a node the token cannot read is
 * reported as missing. That is the same answer the web app gives, and for the
 * same reason: a different answer would confirm the page exists.
 */
async function findNode(
  session: McpSession,
  args: Record<string, unknown>,
): Promise<FoundNode | { error: string }> {
  const select =
    "id, name, path, content, content_version, content_type, review_status, artifact_key, artifact_token";

  if (typeof args.id === "string" && args.id) {
    const { data } = await session.supabase
      .from("nodes")
      .select(select)
      .eq("id", args.id)
      .maybeSingle();
    return (data as FoundNode | null) ?? { error: "Not found." };
  }

  const spaceId = requireSpace(session, args.space_id);
  if (typeof spaceId !== "string") return { error: spaceId.error };

  if (typeof args.path !== "string" || !args.path) {
    return { error: "Provide either an id, or a space_id and a path." };
  }

  const { data } = await session.supabase
    .from("nodes")
    .select(select)
    .eq("space_id", spaceId)
    .eq("path", args.path)
    .maybeSingle();

  return (data as FoundNode | null) ?? { error: "Not found." };
}

/**
 * The space a call applies to, honouring a token pinned to one.
 *
 * A space-scoped token asking about another space is refused here rather than
 * quietly answered about the wrong one. This is scoping the token's reach, not
 * deciding access: RLS still has the final say on everything inside.
 */
function requireSpace(
  session: McpSession,
  requested: unknown,
): string | { error: string } {
  if (session.spaceId) {
    if (typeof requested === "string" && requested !== session.spaceId) {
      return { error: "This token is scoped to a different space." };
    }
    return session.spaceId;
  }

  if (typeof requested !== "string" || !requested) {
    return { error: "space_id is required." };
  }
  return requested;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@postit/renderer";
import { nodeCapabilities, listChildren, pageContent } from "@/lib/nodes";
import { listBacklinks } from "@/lib/links";
import { listComments } from "@/lib/comments";
import { nodeReview } from "@/lib/review";
import { currentUser } from "@/lib/supabase/server";
import { Share } from "../Share";
import { Mermaid } from "../Mermaid";
import { Comments } from "../Comments";
import { History } from "../History";
import { NewChild } from "../NewChild";
import { Toc } from "../Toc";
import { HtmlView } from "../HtmlView";
import { JsonView } from "../JsonView";
import { FileMark } from "../FileMark";
import { Review } from "../Review";
import { FlowToggle } from "../FlowToggle";
import { FlowOverview } from "../FlowOverview";
import { TokenInventory } from "../TokenInventory";
import { flowOverview } from "@/lib/flows";
import { parseTokens } from "@postit/mockup-spec";
import { createClient } from "@/lib/supabase/server";
import {
  getSpaceBySlug,
  getNodeByPath,
  buildSpaceContext,
  INDEX_PATH,
} from "@/lib/spaces";
import { Editor } from "../Editor";
import "katex/dist/katex.min.css";

export const dynamic = "force-dynamic";

type Params = { slug: string; path?: string[] };
type Search = { edit?: string };

export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug, path } = await params;
  const { edit } = await searchParams;
  const nodePath = path?.length ? path.join("/") : INDEX_PATH;

  // Every not-found below is a real 404, including the case where the node
  // exists but this viewer cannot read it. RLS has already removed those rows,
  // so we cannot tell the difference here either, which is the design: a 403
  // would confirm that restricted content exists at this address.
  const space = await getSpaceBySlug(slug);
  if (!space) notFound();

  const node = await getNodeByPath(space.id, nodePath);
  if (!node) notFound();

  // Asked of the predicates, not inferred from ownership, so a grantee with
  // editor or admin gets the matching affordances. Presentation only: the
  // database refuses the write regardless of what is rendered.
  const { canEdit, canAdmin } = await nodeCapabilities(node.id);
  const viewHref = `/s/${space.slug}/${node.path}`;

  // Read here rather than further down because sharing needs it: whether this
  // viewer may hand over the whole space is a question about who owns it.
  const user = await currentUser();

  // A space's front page is not the space, and the sharing dialog is where
  // that distinction was doing damage. Its folders sit beside it rather than
  // inside it, so a grant on this page reaches this page.
  const spaceHome =
    node.parent_id === null && node.path === INDEX_PATH
      ? {
          spaceId: space.id,
          spaceName: space.name,
          spaceSlug: space.slug,
          canAddMembers: !!user && space.owner_id === user.id,
        }
      : undefined;

  // History is offered to anyone who can read the page, not only to editors.
  // "What did this say last week" is a reader's question at least as often as
  // a writer's, and the revisions are already exactly as readable as the page.
  const actions =
    node.kind === "file" || canEdit || canAdmin ? (
      <div className="page-actions">
        {node.kind === "file" ? (
          <History
            nodeId={node.id}
            nodeName={node.name}
            canEdit={canEdit}
            currentContent={node.content ?? ""}
          />
        ) : null}
        {canAdmin ? (
          <Share
            nodeId={node.id}
            nodeName={node.name}
            spaceHome={spaceHome}
          />
        ) : null}
        {canEdit ? (
          <Link
            className="btn btn-secondary btn-small"
            href={`${viewHref}?edit=1`}
          >
            Edit
          </Link>
        ) : null}
      </div>
    ) : null;

  if (node.kind === "folder") {
    // A folder is somewhere you can stand now that the tree links to one, so
    // it shows what is in it. Only what this viewer can read reaches here: RLS
    // removed the rest before we saw the list.
    const children = await listChildren(node.id);

    // A flow shows what its screens add up to. Only to somebody signed in: it
    // names who approved what, and it is working material, not a document.
    const overview =
      node.is_flow && user ? await flowOverview(await createClient(), node.id) : null;

    return (
      <>
        {actions}
        <article className={`prose ${overview ? "prose-wide" : ""}`}>
          <h1>
            {node.name}
            {node.is_flow ? <span className="tree-badge flow-badge">flow</span> : null}
          </h1>

          {canEdit && node.parent_id !== null ? (
            <FlowToggle folderId={node.id} isFlow={node.is_flow} />
          ) : null}

          {overview ? (
            <FlowOverview overview={overview} spaceSlug={space.slug} canEdit={canEdit} />
          ) : null}

          {overview ? <h2>Everything in this folder</h2> : null}

          {canEdit ? (
            <NewChild
              spaceId={space.id}
              spaceSlug={space.slug}
              parentId={node.id}
            />
          ) : null}

          {children.length === 0 ? (
            <p className="empty">This folder is empty.</p>
          ) : (
            <ul className="folder-contents">
              {children.map((child) => (
                <li key={child.id}>
                  <Link href={`/s/${space.slug}/${child.path}`}>
                    <FileMark type={child.content_type} />
                    {child.name}
                  </Link>
                  {child.review_status === "in_review" ? (
                    <span className="tree-badge tree-badge-review">review</span>
                  ) : null}
                  {child.kind === "folder" ? (
                    <span className="tree-badge">folder</span>
                  ) : child.content_type === "skill" ? (
                    // What it is for. What it is is the chip before the name,
                    // and a skill is Markdown like an article, so repeating the
                    // format here would say nothing.
                    <span className="tree-badge">skill</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </article>
      </>
    );
  }

  if (edit && canEdit) {
    // An HTML page's text is a file rather than a column, and the editor needs
    // the text. Everything else is already in hand.
    const source = await pageContent(node);

    return (
      <Editor
        nodeId={node.id}
        nodeName={node.name}
        initialContent={source ?? ""}
        initialVersion={node.content_version}
        initialContentType={node.content_type ?? "article"}
        viewHref={viewHref}
      />
    );
  }

  // Only Markdown goes through the Markdown pipeline. An HTML file is already
  // a document and a JSON file is data, so each gets the viewer it deserves and
  // everything around them — the title, history, sharing, backlinks, the
  // conversation — stays exactly the same.
  const markdown = node.content_type === "article" || node.content_type === "skill";

  const rendered = markdown
    ? await renderMarkdown(
        node.content ?? "",
        await buildSpaceContext(space.id, space.slug),
      )
    : null;

  const backlinks = await listBacklinks(space.slug, node.id);

  // Comments require an account, even on a published page. An anonymous
  // visitor gets the document and no conversation.
  const comments = user ? await listComments(node.id) : [];

  // Nor is a review state anything to show the internet: it names the person
  // who approved something. Null for everybody else, and null for the great
  // majority of pages, which nobody has ever asked to have reviewed.
  const review = user ? await nodeReview(node.id) : null;

  return (
    // Two columns on a wide screen: the page, and the sections of it. The
    // reading column keeps a measure of its own rather than running the whole
    // width of a workspace pane, because a line the eye loses its place on
    // halfway across is the one thing that actually makes reading harder.
    <div className="page-grid">
      <div className="page-col">
        {actions}

        {review ? <Review nodeId={node.id} review={review} /> : null}

        {rendered ? (
          <article
            className="prose"
            // Safe: renderMarkdown sanitizes author HTML before KaTeX and Shiki
            // add their own trusted markup. See packages/renderer/src/sanitize.ts.
            // The title is prepended here rather than written into the document,
            // so renaming a page renames what the page calls itself. It is escaped
            // because a node name is not Markdown and has not been through the
            // sanitizer.
            dangerouslySetInnerHTML={{
              __html: `<h1>${escapeHtml(node.name)}</h1>` + rendered.html,
            }}
          />
        ) : (
          <article className="prose">
            <h1>{node.name}</h1>
            {node.content_type === "html" ? (
              node.artifact_token ? (
                <HtmlView
                  token={node.artifact_token}
                  name={node.name}
                  // Whoever may change the page may hand out its address.
                  // Reading it is not publishing it.
                  canShare={canEdit}
                  reviewHref={user ? `/review/${node.id}` : undefined}
                />
              ) : (
                <p className="msg msg-warn">
                  This page has no file behind it. Upload it again, or edit it
                  and save.
                </p>
              )
            ) : (
              <JsonOrTokens source={node.content ?? ""} />
            )}
          </article>
        )}

        {/* Hydrates any ```mermaid blocks the document contains. Renders
            nothing itself, and loads mermaid only if a diagram is present. */}
        {rendered ? <Mermaid /> : null}

        {backlinks.length > 0 ? (
          // Only what this viewer can read reaches here: the policy on `links`
          // requires both ends to be readable, so the panel cannot become the
          // place that admits a restricted page exists. It is therefore absent
          // rather than empty when nothing readable links here, which is the
          // same thing a page with no backlinks at all shows.
          <nav className="backlinks" aria-label="Pages that link here">
            <h2>Linked from</h2>
            <ul>
              {backlinks.map((link) => (
                <li key={link.id}>
                  <Link href={link.href}>{link.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {user ? (
          <Comments
            nodeId={node.id}
            viewerId={user.id}
            canModerate={canAdmin}
            initialComments={comments}
          />
        ) : null}
      </div>

      {rendered ? <Toc headings={rendered.headings} /> : null}
    </div>
  );
}

/** A node name is plain text; this is what makes it safe to place in markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A DTCG token file reads as its design system; any other JSON as a tree. */
function JsonOrTokens({ source }: { source: string }) {
  const tokens = parseTokens(source);
  if (!tokens) return <JsonView source={source} />;
  return (
    <>
      <TokenInventory set={tokens} />
      <details className="json-source">
        <summary>As a JSON tree</summary>
        <JsonView source={source} />
      </details>
    </>
  );
}

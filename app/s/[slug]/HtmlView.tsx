import { Copyable } from "@/components/Copyable";

/**
 * A stored HTML file, shown as the page it is, and the address you can send.
 *
 * The document is not in this page: it is served from /m/<token>, in a frame,
 * under a policy that puts it in an origin of its own. That isolation is what
 * makes it safe to let a mockup move — a design nobody can interact with is not
 * a design — while leaving it no more authority over this site than any other
 * page on the internet has.
 *
 * The address below it is the point of the whole arrangement. A mockup exists
 * to be shown to somebody who has no account here, and this is the link to send
 * them. It says plainly what that means, because "anybody with this link" is
 * exactly the sort of thing people discover afterwards.
 */
export function HtmlView({
  token,
  name,
  canShare,
}: {
  token: string;
  name: string;
  /** Whether to offer the address. Reading the page is not publishing it. */
  canShare: boolean;
}) {
  const src = `/m/${token}`;

  return (
    <div className="html-view">
      <iframe
        className="html-frame"
        title={`${name}, as a page`}
        // Said twice on purpose: the response carries the same sandbox in a
        // header, and this is what a reader of the markup sees. Neither grants
        // allow-same-origin, which is the token that would undo both.
        sandbox="allow-scripts allow-popups"
        src={src}
        referrerPolicy="no-referrer"
      />

      <p className="hint html-note">
        Shown in a frame of its own, which is what lets it move without giving
        it any reach into Post-it: it cannot read your session, this page, or
        anything else here.
      </p>

      {canShare ? (
        <div className="artifact-share">
          <Copyable label="Link to share" text={absolute(src)} />
          <p className="hint">
            Anybody with this link can open it, with no account and no sign-in.
            It is the only thing in Post-it that is readable without being
            given, so send it to the people you mean to.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The whole address, because a link to paste into a message has to be one.
 *
 * Falls back to the path when nothing says what this site is called, which is
 * a development environment rather than anything a client will see.
 */
function absolute(path: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site ? `${site.replace(/\/$/, "")}${path}` : path;
}

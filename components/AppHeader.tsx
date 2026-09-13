import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Mark } from "@/components/Mark";
import { Pending } from "@/components/NavLink";
import { handle } from "@/lib/people";

/**
 * The bar across the top of every signed-in page.
 *
 * One component because there were three copies of it and they had already
 * drifted: two offered no way to reach your own account and the third had a
 * different set of controls. Anything a particular page needs goes in as
 * children, between the brand and the account.
 *
 * The address is the label on purpose. In a product whose whole subject is who
 * can see what, "which of my accounts is this?" is a question people ask
 * constantly, and a page that answers it only after a click has not answered it.
 *
 * Shortened to the part before the @, though. Everybody here shares a domain,
 * so it is the half that answers nothing while taking the room the half that
 * does answer needs. The whole address is on the tooltip.
 */
export function AppHeader({
  email,
  className,
  admin = false,
  children,
}: {
  email?: string | null;
  className?: string;
  /** Whether to offer the way in to the people screen. */
  admin?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={className ? `shell-header ${className}` : "shell-header"}>
      <Link href={email ? "/spaces" : "/"} className="shell-brand">
        <Mark size={19} />
        Post-it
      </Link>

      {children}

      {/* One group, pushed right, so a page that slots something in the middle
          does not rearrange where the account and sign-out live. */}
      <div className="shell-actions">
        {email ? (
          <>
            {/* Spaces first, because it is where the work is and where people
                are going most of the time. The brand already leads there, but a
                wordmark is not a signpost: it reads as the name of the product
                rather than as the way back to your own things.

                Teams next. They were reachable from one conditional line on one
                page, and only if you were already on a team, which is exactly
                backwards: somebody looking for their teams is usually somebody
                who cannot find them. Shown to everybody signed in; the page
                explains itself when the answer is none. */}
            <Link href="/spaces" className="shell-nav">
              Spaces
              <Pending />
            </Link>
            <Link href="/teams" className="shell-nav">
              Teams
              <Pending />
            </Link>
            {admin ? (
              <Link href="/admin" className="shell-nav">
                People
                <Pending />
              </Link>
            ) : null}
            <Link
              href="/account"
              className="shell-account"
              title={`${email} · your account`}
            >
              {handle(email)}
              <Pending />
            </Link>
            <form action={signOut}>
              <button className="btn btn-secondary btn-small" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="btn btn-secondary btn-small">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

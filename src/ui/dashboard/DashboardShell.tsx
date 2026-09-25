import type { ReactNode } from "react";
import { Icon, Logo, WorldStyleScope } from "../components/index.js";
import type { AuthUser } from "../../auth/types.js";
import "./dashboard.css";

export type DashboardSection = "worlds" | "create" | "samples" | "account";

const NAV: { id: DashboardSection; label: string; icon: "worlds" | "plus" | "compass" | "user"; href: string }[] = [
  { id: "worlds", label: "My worlds", icon: "worlds", href: "/worlds" },
  { id: "create", label: "Create a world", icon: "plus", href: "/create" },
  { id: "samples", label: "Borrow a sample", icon: "compass", href: "/samples" },
  { id: "account", label: "Account", icon: "user", href: "/account" },
];

export function initialsFor(user: Pick<AuthUser, "name" | "email">): string {
  const source = user.name?.trim() || user.email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ user, size = 36 }: { user: AuthUser; size?: number }) {
  return user.avatarUrl
    ? <img className="wk-avatar" src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="wk-avatar wk-avatar--initials" style={{ width: size, height: size }} aria-hidden="true">{initialsFor(user)}</span>;
}

/**
 * The signed-in app frame: a quiet white sidebar on wide screens (logo,
 * four destinations, who is signed in, Sign out) and a top bar with a
 * scrolling tab row on narrow ones. The page itself stays the lavender
 * product ground, so each screen's imagery does the talking.
 */
export function DashboardShell({ active, user, onNavigate, onHome, onSignOut, children }: {
  active: DashboardSection;
  onHome: () => void;
  user: AuthUser;
  onNavigate: (section: DashboardSection) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const nav = (
    <ul className="wk-shell__nav-list">
      {NAV.map((item) => (
        <li key={item.id}>
          <a
            className="wk-shell__link"
            href={item.href}
            aria-current={item.id === active ? "page" : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onNavigate(item.id);
            }}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <WorldStyleScope className="wk-shell">
      <a className="wk-shell__skip" href="#wk-shell-content">Skip to content</a>
      <aside className="wk-shell__side">
        <a
          className="wk-shell__brand"
          href="/"
          aria-label="Wanderkin home page"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onHome();
          }}
        ><Logo size={32} /></a>
        <nav className="wk-shell__nav" aria-label="Dashboard">{nav}</nav>
        <div className="wk-shell__me">
          <button type="button" className="wk-shell__me-link" onClick={() => onNavigate("account")} aria-label="Account">
            <Avatar user={user} />
          </button>
          <div className="wk-shell__who">
            <span className="wk-shell__name">{user.name ?? user.email ?? "Signed in"}</span>
            {user.email && user.name ? <span className="wk-shell__email">{user.email}</span> : null}
          </div>
          <button type="button" className="wk-shell__signout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="signOut" />
          </button>
        </div>
      </aside>
      <div className="wk-shell__content" id="wk-shell-content" tabIndex={-1}>
        {children}
      </div>
    </WorldStyleScope>
  );
}

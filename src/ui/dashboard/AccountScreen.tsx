import { Button, Icon } from "../components/index.js";
import type { AuthMode, AuthUser } from "../../auth/types.js";
import { Avatar } from "./DashboardShell.js";
import "./dashboard.css";

/** Who is signed in, how, and the way out. */
export function AccountScreen({ user, mode, onSignOut }: { user: AuthUser; mode: AuthMode; onSignOut: () => void }) {
  const stub = mode === "stub";
  return (
    <main className="wk-page" aria-labelledby="account-heading">
      <header className="wk-page__head">
        <div>
          <h1 id="account-heading">Account</h1>
          <p className="wk-page__lede">Your worlds belong to the account you sign in with.</p>
        </div>
      </header>

      {stub ? (
        <p className="wk-account__note" role="note">
          <Icon name="spark" />
          <span>You’re using local sign-in for development. Google sign-in switches on once the Supabase keys are added to this site’s settings.</span>
        </p>
      ) : null}

      <section className="wk-account" aria-label="Signed-in account">
        <Avatar user={user} size={72} />
        <div className="wk-account__who">
          <h2>{user.name ?? user.email ?? "Signed in"}</h2>
          {user.email ? <p>{user.email}</p> : null}
          <p className="wk-account__how">{stub ? "Local dev sign-in" : "Signed in with Google"}</p>
        </div>
        <Button variant="secondary" onClick={onSignOut}><Icon name="signOut" />Sign out</Button>
      </section>

      <section className="wk-account__facts" aria-label="About your worlds">
        <div>
          <h3>Private by default</h3>
          <p>Only you can open, edit or export the worlds you make. Nobody else sees them in their list.</p>
        </div>
        <div>
          <h3>Sharing is your choice</h3>
          <p>When you share a finished world, anyone with the link can play that version. Your other worlds stay private.</p>
        </div>
      </section>
    </main>
  );
}

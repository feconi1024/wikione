# Milestone 2 plan: authentication and publishing preparation

## Objective and duration

Milestone 2 is estimated at two to three engineer-weeks. It adds a complete
first-party WikiOne account experience and the review, verification, and
conflict-resolution work required before a wiki edit. Public Wikimedia OAuth
approval is an external release gate.

The approved Milestone 2 objectives are:

- complete authentication popup/dialog and redirect-safe return flows,
  encrypted Redis sessions, session refresh, logout, and identity display;
- implement diff review, edit summary, minor-edit and watchlist choices, direct
  create/update orchestration, post-write revision verification,
  abuse-filter/CAPTCHA error presentation, and three-way conflict handling;
- add user-facing connected-app and privacy pages; and
- retain public OAuth approval as a prerequisite for releasing Wikimedia
  authentication and publishing.

## External boundary

Wikimedia OAuth consumer registration has not been approved. Consequently,
WikiOne must not exchange Wikimedia authorization codes, store Wikimedia
tokens, make authenticated Action API requests, or submit edits to a public
wiki in this milestone. Those entry points remain stable, explicit
`oauth-registration-pending` placeholders.

WikiOne's own account is a separate identity. It authenticates access to
WikiOne account and publishing-preparation features, but it never implies that
the user is connected to Wikipedia and never substitutes a WikiOne password
for Wikimedia authorization.

## Architecture work

### First-party identity

- Store durable account records in PostgreSQL with migrations and uniqueness
  constraints for normalized usernames.
- Hash passwords with a memory-hard algorithm and per-password salt. Bound
  input size and compare derived keys without timing leaks.
- Store only opaque session identifiers in host-only, HTTP-only cookies.
- Hash session identifiers before Redis lookup and encrypt session payloads
  with AES-256-GCM under a versioned deployment key.
- Enforce idle and absolute expiry, explicit rotation/refresh, logout,
  logout-all, password-change revocation, and account deletion.
- Require an exact allowed Origin and a per-session CSRF header for every
  cookie-authenticated mutation. Authentication responses are `no-store`.
- Keep the preview origin cookie-free and unable to access authentication or
  publishing routes.

The first-party v1 workflow includes registration, login, session recovery on
browser reload, explicit refresh, logout, identity/preferences update,
password change, logout-all, and password-confirmed account deletion. Email is
not collected in the initial workflow, so email verification and automated
password recovery are deliberately outside this milestone rather than being
stubbed insecurely.

### Publish preparation

- Preserve the exact base source and base revision in local drafts.
- Generate an accessible, line-oriented review diff between base and proposed
  source.
- Collect a required edit summary plus minor-edit and watchlist choices.
- Fetch the latest source immediately before publishing preparation and
  classify the operation as a safe page create, safe update, or conflict.
- Merge base, local, and latest source without losing non-overlapping changes;
  return explicit conflict regions when both sides changed the same content.
- Normalize provider errors for abuse filters, CAPTCHA, spam blacklist,
  protection, edit conflicts, rate limiting, and upstream availability so the
  review UI can explain the next action safely.
- Define and test a publisher port with an in-memory provider. The port covers
  create/update orchestration and post-write revision verification, while the
  public Wikimedia adapter remains a non-writing approval placeholder.

## Front-end deliverables

- Keep the split editor as the default route and add a route-aware application
  shell without making an external router a runtime requirement.
- Add an authentication dialog with registration and login modes, validation,
  return-to-editor behavior, and safe error announcements.
- Show the current WikiOne identity and session controls in the top bar.
- Add an account view for display-name changes, password changes, logout-all,
  and deletion.
- Add a connected-apps view that independently reports the WikiOne session and
  Wikimedia's `registration pending` state.
- Add a user-facing privacy view matching the implemented storage and
  retention behavior.
- Add a publish-review dialog/drawer with change statistics, line diff, edit
  options, latest-revision readiness, conflict choices, and normalized error
  notices. The final public-wiki action stays disabled and explains the OAuth
  approval gate.
- Preserve keyboard navigation, live announcements, mobile full-screen
  dialogs, reduced-motion behavior, and WCAG AA contrast.

## Verification and acceptance

| Area             | Required evidence                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts        | Runtime parsing tests cover every account, session, preparation, conflict, provider-error, and placeholder state.                                               |
| Accounts         | Repository tests cover normalized uniqueness, registration, login, profile/password changes, session revocation, and deletion.                                  |
| Sessions         | Tests cover encryption, identifier hashing, expiry, rotation, replay rejection, logout, logout-all, and cookie flags.                                           |
| Browser security | Hostile/missing origins and CSRF tokens are rejected; credentialed CORS is exact; preview responses never set account cookies.                                  |
| Review           | Diff statistics, create/update classification, edit options, and error mappings are deterministic and tested.                                                   |
| Conflicts        | Non-overlapping changes merge automatically and overlapping changes produce resolvable regions without data loss.                                               |
| Publisher port   | A fake provider verifies create/update request construction, revision verification, conflict conversion, and abuse/CAPTCHA presentation.                        |
| OAuth boundary   | Wikimedia start/callback/refresh/write routes cannot perform an upstream mutation and consistently return the approval-pending state.                           |
| Browser UX       | End-to-end coverage exercises account lifecycle, identity recovery/refresh/logout, navigation, review options, conflicts, responsive layout, and accessibility. |
| Operations       | Compose starts PostgreSQL and Redis; migrations, key configuration, backup/retention notes, privacy notice, threat model, and release gate are documented.      |

Milestone 2 is repository-complete when all locally implementable rows pass and
the Wikimedia-only rows are verified as non-functional placeholders. A public
release with live sign-in or editing remains blocked until consumer approval,
production HTTPS domains, operator secrets, and a final privacy/security review
are supplied outside the repository.

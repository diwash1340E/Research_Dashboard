# PI-only Advisor Dashboard — Implementation Plan

Status: design phase only. Do not merge into main until authenticated access and data isolation are tested.
Repository: diwash1340E/Research_Dashboard
Hosting: GitHub Pages (static HTML/CSS/JS)

## Current state (repository inspection, 2026-11-14)

- Single static `index.html` with vanilla JS `app.js` and `styles.css`.
- The app stores its complete research state under localStorage key `rl_survey_lab_v1`, schema 1.
- Uploaded files and paper attachments use IndexedDB database `rl_survey_lab_uploads_v1`, object store `files`.
- Existing export/import produces a full JSON backup with `state` and embedded file data.
- No user authentication, cloud persistence, advisor access, or server-side access control exists.
- Do not change the names, schema, or meanings of the existing browser storage keys in this feature.
- No need to upload locally stored documents, private journal entries, notes, or original session logs.

## Architecture

1. Keep the existing local-first research workspace fully usable without login.
2. Add a separate authenticated student publishing section, which reads existing local state but does not overwrite it.
3. Add an authenticated, read-only `advisor.html` page, distinct from the researcher workspace.
4. Use Supabase Auth for owner/advisor identity (invitation-only, email authentication).
5. Use Supabase Postgres with restrictive grants and Row Level Security (RLS) for authorization.
6. Retain static hosting on GitHub Pages; only the approved published snapshot is fetched from the cloud.
7. No service-role/secret key in committed files or browser code. The browser uses only the project URL and publishable key.

## Proposed schema

- `projects`: id uuid (primary key), owner_user_id uuid, title, description.
- `project_members`: project_id uuid, user_id uuid, membership_role ('owner'|'advisor'), active boolean; each membership unique by project/user.
- `published_snapshots`: id uuid, project_id uuid, version integer, published_by uuid, published_at timestamptz, revoked_at timestamptz nullable, payload jsonb with validated allowlisted fields.
- Optional later: `advisor_feedback`, versioned per project (not part of MVP).
- A private server-managed/admin-created membership bootstrap associates the verified owner and invited advisor identities. Do not let end users self-assign roles.
- RLS + grants: unauthenticated users cannot select or modify project data; owner can publish/read only own project's allowed snapshots; designated active advisor can SELECT only published, non-revoked snapshots for designated projects; advisors have no INSERT/UPDATE/DELETE privileges.
- Enforce payload whitelist and size at the DB/API boundary too; do not rely solely on hiding inputs on the frontend.
- Revocation means subsequent server fetches are denied. Previously saved copies/screenshots cannot be retroactively removed.

## Approved export/sync fields (all opt-in, manually reviewed)

Default proposed:
- public researcher display name, academic program or research focus, project title
- current research stage (stage number/title and completion percentage)
- course names and number of completed lessons (not raw study history)
- paper titles, year, publication link, review status; optionally a one-sentence approved takeaway for each
- aggregate focused hours, optional 7-day/weekly summary
- next goal, accomplishments, last-updated timestamp

Default excluded:
- journal entries
- private reading notes (problem, motivation, evidence, limitations, connections, etc.)
- `blocker`, draft research questions, personal data, health and financial details
- uploaded PDFs, private file names and blobs
- raw time-session history
- complete localStorage state, backup files, API tokens

Never send the `state` object wholesale. Build a new allowlisted projection and render a preview before upload. Each publish overwrites nothing locally, and creates a versioned cloud snapshot.

## UI

Researcher workspace:
- `Share with PI` section with select/preview/publish button and last published timestamp
- clear fields that are private vs shared, plus revoke/pause sharing
- explicit confirmation every time before publishing in MVP
- optional comparison showing what changed since the previous snapshot

PI portal:
- verified advisor signs in through email OTP/magic link (do not allow arbitrary self-signup)
- header with researcher name, project, most recent update, research stage
- key metrics: courses completed, papers read/analyzed, hours this week (if selected)
- course progress, completed papers and links, weekly milestones, next goals
- refresh button and timestamp; read-only (no editing actions)
- explicit 'Not yet published' state rather than fake zero progress

## Implementation stages

1. Audit baseline and preserve invariants; export a backup manually in the live dashboard before testing.
2. Create Supabase project, configure Auth URL redirects to the GitHub Pages origin, invitation-only accounts and working email delivery.
3. Add SQL migration(s) and least-privilege RLS/grants; create fixture owner/advisor/stranger users and automated access-denial tests.
4. Build `advisor.html` + `advisor.js` displaying only published content after login.
5. Build `Share with PI` controls on the existing app that safely map the existing local schema to a limited published payload. Do not alter `rl_survey_lab_v1` or IndexedDB.
6. Test backup/export and existing course/paper/session actions on the feature branch.
7. Test private identity and RLS matrix (owner/advisor/other signed-in/anonymous; read/write/delete/revoke).
8. Deploy feature branch in a staging location (not the live GitHub Pages main site) and test mobile, token expiry, revocation and malicious input.
9. Review all published fields with the researcher and only then merge to `main`.

## Critical safeguards

- GitHub Pages source files are public. The page URL alone is not access control.
- Database row-level policies, not merely hiding UI, must protect records.
- Keep the original local storage keys and backup format unchanged.
- Never embed backend administrative secrets in this public repository.
- Use email addresses only for invitation; use authenticated immutable user IDs for authorization.
- Escape all displayed user-entered strings and audit against XSS.
- Validate no private files/notes/backup payload are sent.
- Before any migration or merge, run a no-data-loss regression and export a backup.
- A successful GitHub commit is not proof that authentication or privacy is correct.

## Inputs needed for implementation

- New Supabase project URL and browser-safe publishable key (no secret/server keys in chat or public code).
- Owner identity and advisor's email supplied securely to the Auth admin setup; no need to publish either in the repo.
- Approval of the default manual-publish visibility choices.
- Desired public display name, role, project name.

## Definition of done

- Researcher continues using their existing dashboard and their old progress remains intact.
- Only authenticated, explicitly authorized PI accounts can read published snapshots.
- A different user or signed-out browser cannot retrieve any project data, including through the REST API directly.
- PI cannot alter underlying data, and revocation prevents fresh reads.
- Shared view updates only after explicit publish; no private journal/PDF/backup leaks.
- Works on phone and desktop; documentation includes backup, recovery and security notes.

## Advisor note / approval workflow (implemented as a development-branch scaffold)

New pages:
- `pi.html` — researcher creates a review/approval request, reads advisor decisions and notes, selectively publishes progress, and may revoke published snapshots.
- `advisor.html` — authenticated PI sees approved progress, submits recommendations, and responds to pending requests with Approve, Deny, or Request changes.
- `advisor-portal.js` — shared client controller. It deliberately **reads** `rl_survey_lab_v1` but does not change or reformat it.
- `advisor-portal.css` — responsive layout matching the charcoal/orange identity.
- `advisor-config.js` — initially blank, intentionally disables remote workflows until configured.
- `supabase/migrations/20261114_advisor_collaboration.sql` — owner/member tables, request/note/snapshot tables, RLS, advisor decision and owner revocation functions.

New request categories: research topic approval, paper recommendation, milestone sign-off, meeting, other.
New request states: pending, approved, denied, changes_requested.
PI feedback is required for **every** decision, including Approve. Decisions are one-time; a researcher can submit a new follow-up request to address requested changes.
PI-authored freeform notes: recommendation, general note, reading suggestion, meeting follow-up.

### Configuration — required before use

1. Create a dedicated Supabase project and review usage/pricing. This development plan cannot create that project for the user.
2. Run the SQL migration against that project with appropriate authorized database credentials.
3. Configure Supabase Auth to restrict account creation and invite only the researcher and PI; disable uninvited signup.
4. Add both exact redirect URLs in Supabase Auth:
   - `https://diwash1340e.github.io/Research_Dashboard/pi.html`
   - `https://diwash1340e.github.io/Research_Dashboard/advisor.html`
5. In a trusted database administration interface, obtain the **existing invited Auth users' UUIDs** and provision one project and one active advisor membership. Never do this from the public browser.
6. Run the access-control tests below and fix any failed policies BEFORE deployment. Do not use a real student's private data during testing.
7. Populate `advisor-config.js` with only `supabaseUrl` and the browser-safe `supabasePublishableKey`. **Never commit a secret/service-role key.**
8. Test magic-link sign-in, permissions, request→decision cycle, notes, snapshot preview, revocation, error recovery and mobile UI in staging.
9. Require explicit approval to merge and publish the implementation on `main`.

### Mandatory security test matrix (not yet executed)

| Caller | Read project | Create request | See requests | Write PI note | Approve/deny request | Publish progress | Revoke |
|---|---|---|---|---|---|---|---|
| Owner | Own only | Own only | Own only | Denied | Denied | Own only | Own only |
| Active assigned PI | Assigned only | Denied | Assigned only | Assigned only | Assigned only | Denied | Denied |
| Signed-in unrelated user | Denied | Denied | Denied | Denied | Denied | Denied | Denied |
| Signed-out/anon | Denied | Denied | Denied | Denied | Denied | Denied | Denied |
| Former PI (revoked membership) | Denied | Denied | Denied | Denied | Denied | Denied | Denied |

Additional checks:
- A request can be decided only when pending; rejected or repeated responses must fail.
- Feedback shorter than 3 characters or longer than 4000 must fail.
- Client attempts to insert requests directly with `status='approved'` must fail.
- Direct table UPDATE and DELETE must fail for both users.
- Revoking published snapshots prevents future SELECT; preexisting screenshots/local copies cannot be erased.
- A different signed-in user cannot access the same data through REST endpoints, even after manually changing browser UI.
- No `rl_survey_lab_v1`, private journal/PDF/notes, raw `sessions`, or backup JSON is transmitted.
- Legacy backup/export still produces the same shape, and previous progress is preserved after switching pages.
- After login expiry, previously fetched sensitive views must not remain visible to unauthorized sessions; test signout, token expiry, and refresh behavior.
- Test browser back/forward, lost network, invalid invited email, and hostile HTML strings in note/request text.

### Deployment status

**Not deployed:** A GitHub commit only verifies source code was recorded. Supabase has not been configured, the SQL has not been applied, end-to-end authentication has not been tested, and no real PI messages can be sent yet. `main` intentionally remains unchanged.

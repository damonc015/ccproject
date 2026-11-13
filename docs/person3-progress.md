# Person 3 implementation log

## Scope

Local-only API, persistent SQLite data, registered-user sharing, version previews,
run status, and an opt-in frontend connection. No AWS deployment or real execution.
Working branch: `yeji/local-api`, based on `ethan/frontend` (`255d5ff`).

## Commit-sized steps

1. **Contract** — HTTP routes, roles, user policy and service boundaries.
2. **Foundation** — TypeScript/Express, SQLite schema, local identity, seed, errors.
3. **Documents and sharing** — create/list/open/delete, role enforcement, existing
   users only, permission regression tests.
4. **Read APIs** — version history/preview and run status, cross-document checks.
5. **Local integration** — opt-in HTTP frontend, isolated collaboration stub,
   setup instructions and handoff.
6. **Verification** — build/tests, browser smoke test, documented findings/fixes.

## Updates

- Contract recorded before implementation. Local shared-user lookup deliberately
  excludes invitation-by-email and public links.
- Existing frontend IDs and execution field names are retained.
- `RunStatus` remains owned by the existing infrastructure definition; local
  storage is a test adapter, not a second cloud table.
- Foundation complete: Node 24 native SQLite, Express/TypeScript, schema versioning,
  repeatable seed, local identity and controlled CORS. Production startup is rejected.
- Foundation validation: build and typecheck passed; 3 tests passed, including
  persistence across database reopen and preservation of revoked access on reseed.
- Documents/sharing complete: document create/list/open/delete, registered and
  confirmed email lookup, owner-only grant/revoke, immutable ownership and cascading
  local deletion. No user is created implicitly by sharing.
- Validation after documents/sharing: build/typecheck and all 10 tests passed.
  Covered forged ownership, malformed/oversized input, role escalation, normalized
  email, unknown/unconfirmed recipients and immediate access revocation.
- Read APIs complete: immutable version previews and normalized run status responses.
  Reads enforce current membership and exact document/resource pairing; they do not
  mutate jobs or expose internal task/source data.
- Read API validation: build/typecheck and all 15 tests passed, including swapped
  document IDs, missing jobs/versions, revocation, queued defaults and timeout results.
- Local integration added: opt-in typed HTTP client, registered demo users, explicit
  simulation notices and disabled Viewer execution. New server documents open via
  the isolated `/dev` bridge rather than missing browser mock records.
- Added setup, API examples, ownership handoff and remaining production decisions.
- Integration validation so far: backend build/typecheck and 18 tests passed;
  frontend production build passed (existing large editor bundle warning remains).
- Browser verification complete: 2 Playwright/Chromium tests passed. Covered
  creation, source save/reload, immutable preview, labelled run fixture, unregistered
  email rejection, separate-user sharing, editor-to-viewer change, blocked editing,
  disabled Viewer Run, revocation, deletion and inaccessible-document handling.
- Added repeatable browser test configuration with separate ports and a fresh temp
  database; updated architecture to distinguish local implementation from the old
  cloud proposal. Added the local schema/access-path reference.
- Local MVP scope is complete. Remaining work is the Person 1/2/4 production
  integration listed in `person3-handoff.md`, not an unimplemented REST endpoint.
- Renamed the working branch to `yeji/local-api` at Yeji's request; the six
  implementation commits are preserved unchanged.

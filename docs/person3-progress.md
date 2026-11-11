# Person 3 implementation log

## Scope

Local-only API, persistent SQLite data, registered-user sharing, version previews,
run status, and an opt-in frontend connection. No AWS deployment or real execution.
Working branch: `person3/local-api`, based on `ethan/frontend` (`255d5ff`).

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

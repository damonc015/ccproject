# Person 3 handoff

## Implemented locally

- LF1-equivalent document create/list/open/delete and registered-email sharing.
- Role checks on every document REST action, owner-only grants, no ownership transfer.
- LF2-equivalent version list/immutable text preview.
- LF3-equivalent execution status reads with existing Person 4 field names.
- SQLite schema and seed, repeatable tests, opt-in frontend HTTP adapter.
- Optional local-only source/version/run stand-ins so the current editor can be tested.

See [setup](local-development.md) and [HTTP contract](person3-api.md).
This work neither changes nor deploys the AWS stacks.

## Person 1 integration

`VITE_API_MODE=local` selects `frontend/src/api/http.ts`; the default stays mock.
The adapter conforms to the existing `Api` type. Version content is unwrapped from
`{content}`. It sends `X-Dev-User-Id` only for local impersonation.
Mock sharing now also rejects emails that have no confirmed demo account.

Local API mode uses the four seeded users and disables registration. Replace local
identity headers with verified Cognito authentication when deploying. The current
auth handoff specifies ID tokens and `sub`; no new auth/token contract is introduced.
Production registered-email lookup needs a trusted user directory populated by the
registration/confirmation flow or a server-side Cognito lookup. Never derive a real
user's `sub` from an email address or trust a client-supplied owner field.

The UI can read role lists as any document member; owners alone can change them.
Local policy disables Viewer run requests. Agree this policy with Person 2 before
switching execution providers.

## Person 2 integration

- Document IDs come from Person 3. Document creation currently creates metadata
  only; the stub reads missing content as an empty string. Define how your first
  authorized connection initializes an empty Yjs document.
- Replace `loadContent`, `saveContent`, `createVersion` and `startRun` in the client
  with your collaboration provider. `/dev` routes are not production APIs.
- Preserve `createdBy` (user ID) in version storage, with the displayed name and
  immutable preview text captured from the same state as the restoration snapshot.
- Agree whether explicit Save version or each autosave creates a snapshot.
- Use the same document owner/membership data for connect and update checks.
  Current local checks live in `backend/src/permissions.ts`. Choose a shared data
  adapter or authenticated internal permission endpoint for production; none exists yet.
- Permission revocation must also affect active WebSocket sessions. Current REST
  checks apply immediately, but the mock frontend has no permission push channel.
- Production restore must apply to the live CRDT, preserving concurrent work;
  the development whole-text replacement is not a production restore implementation.

## Person 4 integration

`GET /documents/:documentId/runs/:jobId` returns the existing `RunStatus` DTO,
including `jobId`. Missing output is `''`, missing exit/timestamps are `null`.
Lookup checks both the job's document and caller access. No GET changes job state.

The production `RunStatus` table is already created by `ExecStack`. Import/reuse
it; do not create a duplicate in `BaseStack`. `schemas/SCHEMAS.md` and the execution
handoff are the contract, including `NONZERO_EXIT` for a nonzero exit.
Local development only reads stored result fixtures; no dispatcher, SQS, runner
or Fargate tasks are invoked. `/dev/.../runs` immediately creates a labelled
completed fixture and deliberately does not simulate real execution timing.

## Deferred work

- Cognito verification, production user directory synchronization, Lambda adapters,
  DynamoDB access patterns/IAM and object-store preview reads.
- Real collaborative editing, CRDT persistence and live restore (Person 2).
- Real code execution, queueing and cleanup (Person 4).
- Pagination, rename, server-side search, public links and version diff/tree.
- Production delete lifecycle: coordinate live sessions, queued jobs and stored
  objects. Only the SQLite cascade is implemented.

Before deploying, replace local identity and storage adapters; do not expose this
loopback development server as the production service. Build separation does not
make SQL queries interchangeable with DynamoDB; redesign those reads intentionally.

# Person 3 local data model

The executable schema is `backend/src/storage/database.ts`, version 1 via SQLite
`PRAGMA user_version`. Foreign keys are enabled on every connection. File-backed
databases use WAL and a 5-second busy timeout. This is a local relational model,
not a finalized DynamoDB key/index design.

| Table | Key | Relationships and responsibility |
|---|---|---|
| `users` | `userId` | Unique normalized email, display name, confirmation flag; seed replaces signup locally |
| `documents` | `documentId` | `ownerId → users`; title, Python language, timestamps |
| `document_members` | `(documentId, userId)` | Editor/viewer grants; owner is derived from `documents` |
| `versions` | `versionId` | Document, author ID/name, label, time, immutable preview source |
| `runs` | `jobId` | Document, requester, language, status/output/times; matches execution contract |
| `dev_content` | `documentId` | Temporary whole-text source store, replaced by Person 2's CRDT persistence |

Deleting a document cascades to grants, versions, runs and development content in
the local database. Users are not deleted. There is no user-deletion API.

## Access paths

- Gallery: owned documents plus memberships for caller, joined to owner display name.
  Indexes on `documents.ownerId` and `document_members(userId, documentId)`.
- Document permission: document ID plus caller ID; owner takes precedence over grants.
- Sharing: exact normalized email lookup in confirmed users, then upsert membership.
- Collaborators: document owner plus all grants, with display names/emails.
- Versions: by document ID, descending `createdAt`, then `versionId` for stable ties.
  Content preview also requires the version/document pair.
- Runs: by `jobId`, additionally checking the stored document ID matches the route.
  Run outputs are projected; `requestedBy`, `taskArn` and internal metadata stay private.

All callers must be confirmed users. Every read/write checks current document
permissions. The service-level ownership invariant is enforced through one shared
check; direct DB writers must preserve it too. No client can set owner or timestamps.

## Writers and future adapters

| Data | Local writer | Intended production writer |
|---|---|---|
| User directory | Seed | Trusted signup/confirmation sync or server-side identity lookup |
| Documents and grants | Person 3 REST | Person 3 REST |
| Content and updated time | Opt-in development stub | Person 2 |
| Versions and preview source | Seed/development stub | Person 2 |
| Run queued record | Seed/development fixture | Person 2 |
| Run status and output | Seed/development fixture | Person 4 |

Before switching to DynamoDB, agree on document and grant access patterns with
Person 2, and on how code saves update the gallery's `updatedAt`. Use the existing
`RunStatus` table from `ExecStack`. Snapshot storage should include both restoration
state and preview text captured consistently; SQLite currently holds only preview
text, not a Yjs restoration snapshot.

The REST transport/auth code is separated from service logic. Services currently
issue SQLite queries; a DynamoDB implementation requires a deliberate storage
adapter/refactor and consistency choices, not simply changing a connection URL.

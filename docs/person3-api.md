# Person 3 REST contract (local MVP)

Status: core REST endpoints implemented. Based on `ethan/frontend` at `255d5ff`.
The frontend's `frontend/src/api/types.ts` defines the response DTOs. This
document adds HTTP semantics; it does not replace Person 2's collaboration API.

## Decisions

- A document is one Python source file. No folders or multi-file projects.
- Only existing, confirmed users can receive access, by email. No invitations.
- Email is trimmed and lowercased consistently in the local user directory.
  Permissions reference stable `userId`, never email. Production IDs are Cognito `sub`.
- Exactly one owner, stored on the document. Memberships store editor/viewer
  grants only. The owner is included in the collaborators response.
- Only owners change sharing or delete documents. All three roles may read
  document metadata, collaborators, versions and execution results.
- No public documents. Copying a URL does not grant access.
- The local development collaboration stub permits owner/editor actions only.
  Production execution and snapshot permissions must also be enforced by Person 2.
- Lists return arrays, matching the existing frontend. Pagination is deferred;
  a future cursor API will require a coordinated client change.

## Authentication and errors

Local API requests use `X-Dev-User-Id`, resolved against the seeded user directory.
This is impersonation for local testing, not secure authentication. The server
binds to loopback and refuses production mode. No body field can choose the caller.
Later, an authentication adapter must obtain `sub` from verified Cognito claims.

Except for the diagnostic `/health` route and CORS preflight, every route requires
a known confirmed user. Every document-scoped route checks current permissions.
No-access documents return 404 to avoid exposing their existence; insufficient
privileges on accessible documents return 403.

Errors are JSON: `{ "error": { "code": "USER_NOT_FOUND", "message": "..." } }`.
Use 400 for invalid input, 401 for a missing/unknown local identity, 403 for an
insufficient role, 404 for absent/inaccessible resources, and 413 for oversized
request bodies. Internal errors must not expose SQL or stack traces.

## Endpoints

| Method and path | Input | Successful response | Access |
|---|---|---|---|
| `POST /documents` | `{title?: string}`; trimmed, max 200 chars; blank defaults to `untitled.py` | 201 `DocumentSummary` | Signed in |
| `GET /documents` | none | 200 `DocumentSummary[]`, newest update first | Owned/shared only |
| `GET /documents/:documentId` | none | 200 `DocumentSummary` | Viewer+ |
| `DELETE /documents/:documentId` | none | 204 | Owner |
| `GET /documents/:documentId/collaborators` | none | 200 `Collaborator[]` | Viewer+ |
| `POST /documents/:documentId/collaborators` | `{email, role: 'editor' \| 'viewer'}` | 200 complete `Collaborator[]` | Owner |
| `DELETE /documents/:documentId/collaborators/:userId` | none | 200 complete `Collaborator[]` | Owner |
| `GET /documents/:documentId/versions` | none | 200 `VersionMeta[]`, newest first | Viewer+ |
| `GET /documents/:documentId/versions/:versionId/content` | none | 200 `{content: string}` | Viewer+ |
| `GET /documents/:documentId/runs/:jobId` | none | 200 `RunStatus` | Viewer+ |

Unknown body properties are rejected. Sharing updates an existing grant without
duplicates. A missing/unconfirmed target returns 404 `USER_NOT_FOUND`, after
checking ownership. Granting/removing the owner's membership is rejected with
400 `OWNER_IMMUTABLE`. Removing an already absent non-owner grant is idempotent.

Document creation derives owner and timestamps on the server. Version and run
reads verify their actual `documentId` against the URL as well as caller access.
Local deletion atomically cascades to memberships, versions, runs and stub content.
Production deletion must additionally coordinate active sessions and object storage.

## Execution data

Preserve `jobId`, `documentId` and status names from `schemas/SCHEMAS.md`.
Return `jobId`, `status`, `stdout`, `stderr`, `exitCode`, `error`, `startedAt`,
`finishedAt`. Missing output/error strings become `''`; missing exit code and
timestamps become `null`. Never return `taskArn`, source code or internal data.
Read endpoints never advance execution state. No new AWS run table is created.

## Version data

Return `versionId`, `documentId`, `label`, `createdByName`, `createdAt` in lists.
Store `createdBy` internally as well. Preview content is immutable source text
from the same snapshot as Person 2's restoration state. The local schema stores
text inline; a future object-store adapter can resolve `contentRef`.

Person 2 owns snapshot creation, restoration and Yjs state. Agree on explicit
Save version versus autosave snapshots before production integration.

## Local collaboration replacement

An opt-in `/dev` namespace keeps the current editor usable before Person 2's
server exists. It is not part of the production REST contract and must be disabled
by default. It may store plain source text, create preview fixtures and create
explicitly labelled synthetic run results. It never executes submitted code and
does not provide cross-browser synchronization. It applies the same permissions.

Set `ENABLE_COLLAB_STUB=true` to enable these routes:

| Method and path | Body | Result | Access |
|---|---|---|---|
| `GET /dev/documents/:id/content` | none | `{content}`, empty for a new document | Viewer+ |
| `PUT /dev/documents/:id/content` | `{content}` (max 100,000 characters) | 204 | Editor+ |
| `POST /dev/documents/:id/versions` | `{label, content}` | 201 `VersionMeta` | Editor+ |
| `POST /dev/documents/:id/runs` | `{code}` (max 7,000 characters) | 201 `{jobId}` | Editor+ |

The run stub immediately stores a completed fixture with stdout explicitly stating
that code was not executed. Invalid/oversized stub input returns 400; production
execution error states remain governed by Person 4's contract. The content store
uses whole-text replacement and is not safe for simultaneous collaborative saves.

## Integration ownership

- Person 1: real HTTP client, verified Cognito login, UI error handling.
- Person 2: authoritative live code, connect/update permissions, snapshot creation
  and restoration, job creation, permission revocation on connected sessions.
- Person 3: document/user directory, roles, REST reads and checks, local persistence.
- Person 4: execution status writes, sandboxing and job cleanup.

The existing `ExecStack` already defines `RunStatus`; reuse it when moving to AWS.
The diagram on `main` is an older proposal; this MVP follows the Hocuspocus role
split and the execution handoff. No infrastructure deployment is needed here.

# Local development

## Prerequisites

- Node.js 24+ and npm (`nvm use` if using nvm).
- Two terminals, starting at the repository root. Commands below use Bash.
- This is a local demo with impersonated identities, not a deployable auth service.

## Backend

```bash
cd backend
npm ci
npm run db:seed
ENABLE_COLLAB_STUB=true npm run dev
```

The API listens on `http://127.0.0.1:3001`. SQLite data persists in
`backend/.data/ccproject.sqlite` relative to the backend working directory.
Seed is repeatable and does not overwrite existing documents, edits or grants.
It creates the `hello.py` example, one preview version and one completed sample run.
`GET /health` is available without authentication for diagnostics.

Backend settings are listed in `backend/.env.example`. Export them in the shell;
this server does not automatically read `.env`. `DB_PATH` can select another file.
`FRONTEND_ORIGINS` is an exact comma-separated CORS allowlist; default origins are
`http://localhost:5173` and `http://127.0.0.1:5173`.

For REST-only development, run `npm run dev` without `ENABLE_COLLAB_STUB`. All
`/dev` endpoints then return 404; the editor's temporary content/run bridge needs
the stub enabled. Neither mode executes Python or contacts AWS.

## Frontend

In the second terminal:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. Restart Vite after changing `.env.local`.
Without `VITE_API_MODE=local`, the frontend retains its browser-only mock mode.
Do not use `VITE_AUTH_MODE=cognito` with the local API.

### Test users

Any password of at least 8 characters works in the local mock sign-in. It is not
stored or verified. Local mode disables registration; only these seeded users exist.

| Email | Header identity | Role on seeded `doc_demo` |
|---|---|---|
| `demo@example.com` | `u_demo@example.com` | Owner |
| `grace@example.com` | `u_grace@example.com` | Editor |
| `linus@example.com` | `u_linus@example.com` | Viewer |
| `outsider@example.com` | `u_outsider@example.com` | No access |

Use separate browser profiles/incognito sessions for different users. Browser tabs
share localStorage, so tabs in one profile are not independent test identities.
Unknown or unconfirmed emails cannot receive access. Signing up in browser-only
mock mode does not register that user in the backend database.

## Manual acceptance flow

1. Sign in as Demo User. Create a document and edit its Python text.
2. Wait for **Saved**, then reload. The text and metadata should persist.
3. Share with `grace@example.com` as Editor. Try `nobody@example.com`; expect an error.
4. In a separate browser context, sign in as Grace. The shared document should appear.
5. Add Linus as Viewer. His editor must be read-only and Run must be disabled.
6. Save a version, change the text, and preview the saved version. Preview stays unchanged.
7. Click Run as owner/editor. Expect `[Local fixture] No code was executed.`
8. Remove Grace's access. Her next REST read/write is denied; after reload the
   document cannot open and is absent from her gallery.
9. Delete a document as its owner. Local metadata, grants, previews, runs and source
   rows are deleted together.

The local editor has no cross-browser live synchronization. The development source
store uses whole-text replacement; simultaneous saves can overwrite each other.
Production collaboration and conflict handling require Person 2's Yjs server.
Already-rendered data is not remotely erased when access is revoked, but every
subsequent server request checks current permissions.

## API examples

```bash
curl -H 'X-Dev-User-Id: u_demo@example.com' \
  http://127.0.0.1:3001/documents

curl -X POST -H 'X-Dev-User-Id: u_demo@example.com' \
  -H 'Content-Type: application/json' \
  -d '{"email":"grace@example.com","role":"viewer"}' \
  http://127.0.0.1:3001/documents/doc_demo/collaborators

curl -H 'X-Dev-User-Id: u_demo@example.com' \
  http://127.0.0.1:3001/documents/doc_demo/runs/00000000-0000-4000-8000-000000000001
```

API errors are `{error: {code, message}}`. Missing/unknown identity gives 401;
inaccessible documents give 404; insufficient permissions on accessible documents
give 403. An unregistered sharing target gives 404 `USER_NOT_FOUND`.

## Checks

```bash
cd backend
npm run build
npm run typecheck
npm test
```

```bash
cd frontend
npm run build
```

For the Chromium browser smoke tests, first install backend/frontend dependencies
as above, then run from `frontend`:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite builds/starts its own API on port 3002 and frontend on 5174, with a fresh
temporary SQLite file. Those ports must be free. It uses separate browser contexts
for owner/shared-user checks and stops its servers when finished. Failed runs save
traces/screenshots under `frontend/test-results/` (gitignored). Temporary databases
are left under the OS temp directory for diagnosis, not in your development DB.
To use an installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its path.

The backend tests use isolated temporary/in-memory databases. They do not mutate
your development database. To start with entirely fresh demo data, stop the backend
and use a new `DB_PATH` for both `db:seed` and `dev` rather than deleting data blindly.

## Troubleshooting

- **Cannot reach the local API:** start the backend, verify `/health`, and check
  `VITE_API_BASE_URL`. The backend binds to IPv4 loopback.
- **Document opens in gallery but content returns 404:** enable the collaboration stub.
- **401:** use one of the four seeded accounts and seed the same `DB_PATH` as the server.
- **403 from browser only:** compare the page's exact origin with `FRONTEND_ORIGINS`.
- **Old browser mock data:** local API mode ignores that document store. Backend
  data and browser mock data are deliberately separate.

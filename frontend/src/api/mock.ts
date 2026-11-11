import { getSessionUser, userIdFor } from '../auth/session';
import { findRegisteredDemoUser } from '../auth/AuthContext';
import {
  ApiError,
  type Api,
  type Collaborator,
  type DocumentSummary,
  type Role,
  type RunStatus,
  type VersionMeta,
} from './types';

// In-browser stand-in for API Gateway + Lambda + DynamoDB. Data lives in localStorage.

const DB_KEY = 'ccdemo.db.v1';

interface DocRecord {
  documentId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  acl: Collaborator[]; // includes the owner
  content: string;
  versions: (VersionMeta & { content: string })[];
}

interface DB {
  docs: Record<string, DocRecord>;
}

const wait = (ms = 150 + Math.random() * 200) => new Promise((r) => setTimeout(r, ms));
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

const DEMO: Collaborator = { userId: userIdFor('demo@example.com'), email: 'demo@example.com', name: 'Demo User', role: 'owner' };
const GRACE: Collaborator = { userId: userIdFor('grace@example.com'), email: 'grace@example.com', name: 'Grace', role: 'owner' };
const LINUS: Collaborator = { userId: userIdFor('linus@example.com'), email: 'linus@example.com', name: 'Linus', role: 'owner' };

const FIB_V1 = `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print("fib(10) is 55")
`;

const FIB = `# Fibonacci, iterative version
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print("Hello from the shared editor")
print("fib(10) is 55")
`;

const WORDCOUNT = `from collections import Counter

text = "the quick brown fox jumps over the lazy dog the end"
counts = Counter(text.split())

for word, n in counts.most_common(3):
    print(word, n)

print("done")
`;

const SORTING = `def quicksort(items):
    if len(items) <= 1:
        return items
    pivot, rest = items[0], items[1:]
    left = [x for x in rest if x < pivot]
    right = [x for x in rest if x >= pivot]
    return quicksort(left) + [pivot] + quicksort(right)

print("sorted: [1, 2, 3, 5, 8, 9]")
`;

const SLOW = `import time

print("starting a long job")
time.sleep(30)  # hits the sandbox's 10 second limit
print("never printed")
`;

function seed(): DB {
  const doc = (
    id: string,
    title: string,
    owner: Collaborator,
    others: Collaborator[],
    content: string,
    updatedMin: number,
    versions: DocRecord['versions'] = [],
  ): DocRecord => ({
    documentId: id,
    title,
    ownerId: owner.userId,
    ownerName: owner.name,
    createdAt: ago(updatedMin + 60 * 24 * 3),
    updatedAt: ago(updatedMin),
    acl: [{ ...owner, role: 'owner' }, ...others],
    content,
    versions,
  });

  const docs = [
    doc('doc_fib', 'fibonacci.py', DEMO, [{ ...GRACE, role: 'editor' }, { ...LINUS, role: 'viewer' }], FIB, 12, [
      { versionId: 'v_2', documentId: 'doc_fib', label: 'Switch to iterative', createdByName: 'Grace', createdAt: ago(55), content: FIB },
      { versionId: 'v_1', documentId: 'doc_fib', label: 'First recursive draft', createdByName: 'Demo User', createdAt: ago(60 * 26), content: FIB_V1 },
    ]),
    doc('doc_words', 'word_count.py', GRACE, [{ ...DEMO, role: 'editor' }], WORDCOUNT, 60 * 5),
    doc('doc_sort', 'quicksort.py', LINUS, [{ ...DEMO, role: 'viewer' }], SORTING, 60 * 30),
    doc('doc_slow', 'timeout_demo.py', DEMO, [], SLOW, 60 * 24 * 4),
  ];
  return { docs: Object.fromEntries(docs.map((d) => [d.documentId, d])) };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* fall through to seed */
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: DB) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function resetMockData() {
  localStorage.removeItem(DB_KEY);
}

function me() {
  const u = getSessionUser();
  if (!u) throw new ApiError(401, 'Not signed in.');
  return u;
}

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

// Every call re-checks the caller's role, like the Lambda authorizer path will.
function access(db: DB, documentId: string, min: Role = 'viewer') {
  const doc = db.docs[documentId];
  if (!doc) throw new ApiError(404, 'Document not found.');
  const role = doc.acl.find((c) => c.userId === me().userId)?.role;
  if (!role) throw new ApiError(403, 'You do not have access to this document.');
  if (RANK[role] < RANK[min]) throw new ApiError(403, `This action needs the ${min} role.`);
  return { doc, role };
}

const summary = (doc: DocRecord, role: Role): DocumentSummary => ({
  documentId: doc.documentId,
  title: doc.title,
  language: 'python',
  ownerId: doc.ownerId,
  ownerName: doc.ownerName,
  role,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// ---- fake sandbox -----------------------------------------------------------

interface MockRun {
  jobId: string;
  createdAt: number;
  result: Pick<RunStatus, 'status' | 'stdout' | 'stderr' | 'exitCode' | 'error'>;
  instant: boolean;
}

const runs = new Map<string, MockRun>();
const QUEUED_MS = 1200;
const RUNNING_MS = 2200;

// Does not execute Python. It only pattern-matches enough to exercise every result state.
function fakeExecute(code: string): MockRun['result'] {
  if (code.length > 7000) return { status: 'failed', stdout: '', stderr: '', exitCode: null, error: 'CODE_TOO_LARGE' };

  const printed = [...code.matchAll(/^[ \t]*print\(\s*(["'])(.*?)\1\s*\)/gm)].map((m) => m[2]);
  const sleep = code.match(/time\.sleep\(\s*(\d+)/);
  const timeoutAt = /while\s+True\s*:/.test(code) || (sleep && Number(sleep[1]) >= 10);

  if (timeoutAt) {
    const before = code.slice(0, code.search(/while\s+True\s*:|time\.sleep\(/));
    const out = [...before.matchAll(/^[ \t]*print\(\s*(["'])(.*?)\1\s*\)/gm)].map((m) => m[2]);
    return { status: 'failed', stdout: out.map((l) => l + '\n').join(''), stderr: '', exitCode: 124, error: 'TIMEOUT' };
  }

  const raise = code.match(/raise\s+(\w+)(?:\(\s*["'](.*?)["']\s*\))?/);
  if (raise) {
    const line = code.slice(0, raise.index).split('\n').length;
    return {
      status: 'failed',
      stdout: '',
      stderr: `Traceback (most recent call last):\n  File "main.py", line ${line}, in <module>\n${raise[1]}${raise[2] ? ': ' + raise[2] : ''}\n`,
      exitCode: 1,
      error: 'NONZERO_EXIT',
    };
  }

  const stdout = printed.length
    ? printed.map((l) => l + '\n').join('')
    : /print\(/.test(code)
      ? '[mock runner] print() calls found, but only string literals are echoed in the demo\n'
      : '';
  return { status: 'completed', stdout, stderr: '', exitCode: 0, error: '' };
}

// ---- API --------------------------------------------------------------------

export const mockApi: Api = {
  async listDocuments() {
    await wait();
    const uid = me().userId;
    return Object.values(load().docs)
      .map((d) => ({ d, role: d.acl.find((c) => c.userId === uid)?.role }))
      .filter((x): x is { d: DocRecord; role: Role } => !!x.role)
      .map(({ d, role }) => summary(d, role));
  },

  async createDocument(title) {
    await wait();
    const user = me();
    const db = load();
    const now = new Date().toISOString();
    const doc: DocRecord = {
      documentId: newId('doc'),
      title: title.trim() || 'untitled.py',
      ownerId: user.userId,
      ownerName: user.name,
      createdAt: now,
      updatedAt: now,
      acl: [{ ...user, role: 'owner' }],
      content: '# Start typing. Everyone with access sees your edits live.\nprint("Hello world")\n',
      versions: [],
    };
    db.docs[doc.documentId] = doc;
    save(db);
    return summary(doc, 'owner');
  },

  async getDocument(documentId) {
    await wait();
    const { doc, role } = access(load(), documentId);
    return summary(doc, role);
  },

  async deleteDocument(documentId) {
    await wait();
    const db = load();
    access(db, documentId, 'owner');
    delete db.docs[documentId];
    save(db);
  },

  async listCollaborators(documentId) {
    await wait();
    return access(load(), documentId).doc.acl;
  },

  async shareDocument(documentId, email, role) {
    await wait();
    const db = load();
    const { doc } = access(db, documentId, 'owner');
    const key = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(key)) throw new ApiError(400, 'Enter a valid email address.');
    if (role === 'owner') throw new ApiError(400, 'A document has exactly one owner.');
    const registered = findRegisteredDemoUser(key);
    if (!registered) throw new ApiError(404, 'No registered user has this email address.');
    const userId = userIdFor(key);
    if (userId === doc.ownerId) throw new ApiError(400, 'The owner already has full access.');
    const existing = doc.acl.find((c) => c.userId === userId);
    if (existing) existing.role = role;
    else doc.acl.push({ userId, email: key, name: registered.name, role });
    save(db);
    return doc.acl;
  },

  async unshareDocument(documentId, userId) {
    await wait();
    const db = load();
    const { doc } = access(db, documentId, 'owner');
    if (userId === doc.ownerId) throw new ApiError(400, 'The owner cannot be removed.');
    doc.acl = doc.acl.filter((c) => c.userId !== userId);
    save(db);
    return doc.acl;
  },

  async listVersions(documentId) {
    await wait();
    return access(load(), documentId).doc.versions.map(({ content: _content, ...meta }) => meta);
  },

  async getVersionContent(documentId, versionId) {
    await wait();
    const v = access(load(), documentId).doc.versions.find((x) => x.versionId === versionId);
    if (!v) throw new ApiError(404, 'Version not found.');
    return v.content;
  },

  async createVersion(documentId, label, content) {
    await wait();
    const db = load();
    const { doc } = access(db, documentId, 'editor');
    const v = {
      versionId: newId('v'),
      documentId,
      label: label.trim() || 'Untitled version',
      createdByName: me().name,
      createdAt: new Date().toISOString(),
      content,
    };
    doc.versions.unshift(v);
    save(db);
    const { content: _content, ...meta } = v;
    return meta;
  },

  async loadContent(documentId) {
    await wait();
    return access(load(), documentId).doc.content;
  },

  async saveContent(documentId, content) {
    await wait(350);
    const db = load();
    const { doc } = access(db, documentId, 'editor');
    doc.content = content;
    doc.updatedAt = new Date().toISOString();
    save(db);
  },

  async startRun(documentId, code) {
    await wait();
    access(load(), documentId);
    const result = fakeExecute(code);
    const run: MockRun = { jobId: crypto.randomUUID(), createdAt: Date.now(), result, instant: result.error === 'CODE_TOO_LARGE' };
    runs.set(run.jobId, run);
    return { jobId: run.jobId };
  },

  async getRun(documentId, jobId) {
    await wait(120);
    access(load(), documentId);
    const run = runs.get(jobId);
    if (!run) throw new ApiError(404, 'Run not found.');
    const elapsed = Date.now() - run.createdAt;
    const startedAt = new Date(run.createdAt + QUEUED_MS).toISOString();
    const empty = { jobId, stdout: '', stderr: '', exitCode: null, error: '', finishedAt: null };
    if (!run.instant && elapsed < QUEUED_MS) return { ...empty, status: 'queued', startedAt: null };
    if (!run.instant && elapsed < QUEUED_MS + RUNNING_MS) return { ...empty, status: 'running', startedAt };
    return {
      jobId,
      ...run.result,
      startedAt: run.instant ? null : startedAt,
      finishedAt: new Date(run.createdAt + (run.instant ? 0 : QUEUED_MS + RUNNING_MS)).toISOString(),
    };
  },
};

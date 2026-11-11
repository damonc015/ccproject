import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './database.js';

export const LOCAL_USERS = [
  { userId: 'u_demo@example.com', email: 'demo@example.com', name: 'Demo User' },
  { userId: 'u_grace@example.com', email: 'grace@example.com', name: 'Grace' },
  { userId: 'u_linus@example.com', email: 'linus@example.com', name: 'Linus' },
  { userId: 'u_outsider@example.com', email: 'outsider@example.com', name: 'Outsider' },
];

export function seedDatabase(db: DatabaseSync) {
  transaction(db, () => {
    for (const user of LOCAL_USERS) {
      db.prepare('INSERT OR IGNORE INTO users (userId, email, name) VALUES (?, ?, ?)').run(user.userId, user.email, user.name);
    }
    const now = new Date().toISOString();
    const added = db.prepare(`INSERT OR IGNORE INTO documents
      (documentId, title, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`)
      .run('doc_demo', 'hello.py', LOCAL_USERS[0].userId, now, now);
    // Seeding again must not undo role changes, restore revoked access or overwrite edits.
    if (added.changes) {
      for (const [user, role] of [[LOCAL_USERS[1], 'editor'], [LOCAL_USERS[2], 'viewer']] as const) {
        db.prepare('INSERT INTO document_members VALUES (?, ?, ?)').run('doc_demo', user.userId, role);
      }
      const content = 'print("Hello from the local demo")\n';
      db.prepare('INSERT INTO dev_content VALUES (?, ?)').run('doc_demo', content);
      db.prepare('INSERT INTO versions VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('version_demo', 'doc_demo', 'Initial example', LOCAL_USERS[0].userId, LOCAL_USERS[0].name, now, content);
      db.prepare(`INSERT INTO runs
        (jobId, documentId, requestedBy, status, stdout, stderr, exitCode, error, createdAt, startedAt, finishedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('00000000-0000-4000-8000-000000000001', 'doc_demo', LOCAL_USERS[0].userId, 'completed',
          '[Local fixture] No code was executed.\n', '', 0, '', now, now, now);
    }
  });
}

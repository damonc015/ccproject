import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filename = ':memory:'): DatabaseSync {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > 1) {
    db.close();
    throw new Error('Database schema is newer than this application.');
  }
  if (version === 0) transaction(db, () => {
    db.exec(`
      CREATE TABLE users (
        userId TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
        name TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1))
      ) STRICT;
      CREATE TABLE documents (
        documentId TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'python' CHECK (language = 'python'),
        ownerId TEXT NOT NULL REFERENCES users(userId),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      ) STRICT;
      CREATE INDEX documents_owner ON documents(ownerId);
      CREATE TABLE document_members (
        documentId TEXT NOT NULL REFERENCES documents(documentId) ON DELETE CASCADE,
        userId TEXT NOT NULL REFERENCES users(userId),
        role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
        PRIMARY KEY (documentId, userId)
      ) STRICT;
      CREATE INDEX members_user ON document_members(userId, documentId);
      CREATE TABLE versions (
        versionId TEXT PRIMARY KEY,
        documentId TEXT NOT NULL REFERENCES documents(documentId) ON DELETE CASCADE,
        label TEXT NOT NULL,
        createdBy TEXT NOT NULL REFERENCES users(userId),
        createdByName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        content TEXT NOT NULL
      ) STRICT;
      CREATE INDEX versions_document ON versions(documentId, createdAt DESC, versionId);
      CREATE TABLE runs (
        jobId TEXT PRIMARY KEY,
        documentId TEXT NOT NULL REFERENCES documents(documentId) ON DELETE CASCADE,
        requestedBy TEXT NOT NULL REFERENCES users(userId),
        language TEXT NOT NULL DEFAULT 'python' CHECK (language = 'python'),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        stdout TEXT,
        stderr TEXT,
        exitCode INTEGER,
        error TEXT,
        createdAt TEXT NOT NULL,
        startedAt TEXT,
        finishedAt TEXT,
        taskArn TEXT,
        ttl INTEGER
      ) STRICT;
      CREATE INDEX runs_document ON runs(documentId);
      CREATE TABLE dev_content (
        documentId TEXT PRIMARY KEY REFERENCES documents(documentId) ON DELETE CASCADE,
        content TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version = 1;
    `);
  });
  return db;
}

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Shapes the frontend expects from the backend.
// Run fields mirror schemas/SCHEMAS.md (Person 4 contract, served by Person 3).

export type Role = 'owner' | 'editor' | 'viewer';

export interface User {
  userId: string; // Cognito sub in production
  email: string;
  name: string;
}

export interface DocumentSummary {
  documentId: string;
  title: string;
  language: 'python';
  ownerId: string;
  ownerName: string;
  role: Role; // the caller's role on this document
  createdAt: string;
  updatedAt: string;
}

export interface Collaborator {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface VersionMeta {
  versionId: string;
  documentId: string;
  label: string;
  createdByName: string;
  createdAt: string;
}

export type RunState = 'queued' | 'running' | 'completed' | 'failed';

export interface RunStatus {
  jobId: string;
  status: RunState;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error: string; // '', NONZERO_EXIT, TIMEOUT, BAD_LANGUAGE, CODE_TOO_LARGE, DISPATCH_FAILED
  startedAt: string | null;
  finishedAt: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Api {
  // LF1: documents + sharing
  listDocuments(): Promise<DocumentSummary[]>;
  createDocument(title: string): Promise<DocumentSummary>;
  getDocument(documentId: string): Promise<DocumentSummary>;
  deleteDocument(documentId: string): Promise<void>;
  listCollaborators(documentId: string): Promise<Collaborator[]>;
  shareDocument(documentId: string, email: string, role: Role): Promise<Collaborator[]>;
  unshareDocument(documentId: string, userId: string): Promise<Collaborator[]>;

  // LF2: versions (list + preview). Create/restore go through the collab server in production.
  listVersions(documentId: string): Promise<VersionMeta[]>;
  getVersionContent(documentId: string, versionId: string): Promise<string>;
  createVersion(documentId: string, label: string, content: string): Promise<VersionMeta>;

  // Collab server stand-ins (document state lives in S3 behind Hocuspocus in production)
  loadContent(documentId: string): Promise<string>;
  saveContent(documentId: string, content: string): Promise<void>;
  startRun(documentId: string, code: string): Promise<{ jobId: string }>;

  // LF3: run status, polled until completed/failed
  getRun(documentId: string, jobId: string): Promise<RunStatus>;
}

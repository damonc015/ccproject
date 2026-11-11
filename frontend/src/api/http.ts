import { getSessionUser } from '../auth/session';
import { ApiError, type Api } from './types';

// Local identity adapter only. Cognito production authentication belongs to Person 1.
export function createHttpApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/$/, '');
  async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const user = getSessionUser();
    if (!user) throw new ApiError(401, 'Not signed in.');
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers: { 'X-Dev-User-Id': user.userId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the local API. Check that the backend is running.');
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(response.status, payload?.error?.message ?? `Request failed (${response.status}).`);
    }
    return response.status === 204 ? undefined as T : response.json();
  }
  const doc = (id: string) => `/documents/${encodeURIComponent(id)}`;
  return {
    listDocuments: () => call('/documents'),
    createDocument: title => call('/documents', 'POST', { title }),
    getDocument: id => call(doc(id)),
    deleteDocument: id => call(doc(id), 'DELETE'),
    listCollaborators: id => call(`${doc(id)}/collaborators`),
    shareDocument: (id, email, role) => call(`${doc(id)}/collaborators`, 'POST', { email, role }),
    unshareDocument: (id, userId) => call(`${doc(id)}/collaborators/${encodeURIComponent(userId)}`, 'DELETE'),
    listVersions: id => call(`${doc(id)}/versions`),
    getVersionContent: async (id, versionId) => (await call<{ content: string }>(`${doc(id)}/versions/${encodeURIComponent(versionId)}/content`)).content,
    getRun: (id, jobId) => call(`${doc(id)}/runs/${encodeURIComponent(jobId)}`),
    // Temporary opt-in stand-ins. Replace these four methods with Person 2's client.
    loadContent: async id => (await call<{ content: string }>(`/dev${doc(id)}/content`)).content,
    saveContent: (id, content) => call(`/dev${doc(id)}/content`, 'PUT', { content }),
    createVersion: (id, label, content) => call(`/dev${doc(id)}/versions`, 'POST', { label, content }),
    startRun: (id, code) => call(`/dev${doc(id)}/runs`, 'POST', { code }),
  };
}

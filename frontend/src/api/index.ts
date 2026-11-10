import { mockApi } from './mock';
import type { Api } from './types';

// Single switch point: replace mockApi with the real REST client when Person 3's API is up.
export const api: Api = mockApi;
export * from './types';

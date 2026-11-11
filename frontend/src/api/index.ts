import { mockApi } from './mock';
import type { Api } from './types';
import { createHttpApi } from './http';
import { USE_LOCAL_API, API_BASE_URL } from '../config';

export const api: Api = USE_LOCAL_API ? createHttpApi(API_BASE_URL) : mockApi;
export * from './types';

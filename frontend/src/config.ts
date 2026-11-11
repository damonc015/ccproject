// Local development uses the mock sign-in. Set VITE_AUTH_MODE=cognito for deployed builds
// once the Cognito client is wired in.
export const USE_MOCK_AUTH = import.meta.env.VITE_AUTH_MODE !== 'cognito';
export const USE_LOCAL_API = import.meta.env.VITE_API_MODE === 'local';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001';
if (USE_LOCAL_API && !USE_MOCK_AUTH) throw new Error('The local API requires mock authentication.');

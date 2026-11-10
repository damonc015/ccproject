// Local development uses the mock sign-in. Set VITE_AUTH_MODE=cognito for deployed builds
// once the Cognito client is wired in.
export const USE_MOCK_AUTH = import.meta.env.VITE_AUTH_MODE !== 'cognito';

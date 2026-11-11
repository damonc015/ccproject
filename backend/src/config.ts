export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV && !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Local impersonation auth is only available in development/test.');
  }
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (env.ENABLE_COLLAB_STUB && !['true', 'false'].includes(env.ENABLE_COLLAB_STUB)) {
    throw new Error('ENABLE_COLLAB_STUB must be true or false.');
  }
  return {
    port,
    databasePath: env.DB_PATH ?? '.data/ccproject.sqlite',
    frontendOrigins: (env.FRONTEND_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()),
    enableCollabStub: env.ENABLE_COLLAB_STUB === 'true',
  };
}

import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase } from './storage/database.js';

const config = readConfig();
const db = openDatabase(config.databasePath);
const server = createApp({ db, ...config }).listen(config.port, '127.0.0.1', () => {
  console.log(`Local API: http://127.0.0.1:${config.port} (development identity only)`);
  console.log(`Collaboration stub: ${config.enableCollabStub ? 'enabled; code is NOT executed' : 'disabled'}`);
});
server.on('error', error => { console.error(error.message); db.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { db.close(); }));
}

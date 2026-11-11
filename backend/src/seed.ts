import { readConfig } from './config.js';
import { openDatabase } from './storage/database.js';
import { LOCAL_USERS, seedDatabase } from './storage/seed.js';

const db = openDatabase(readConfig().databasePath);
try {
  seedDatabase(db);
  console.log('Seed ready. Registered local identities:');
  for (const user of LOCAL_USERS) console.log(`${user.email} — X-Dev-User-Id: ${user.userId}`);
} finally { db.close(); }

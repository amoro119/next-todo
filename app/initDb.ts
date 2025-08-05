// app/initDb.ts
import { PGlite } from '@electric-sql/pglite';
import { setupOfflineSync } from './offlineSync';

let dbInstance: PGlite | null = null;

export async function initDb(): Promise<PGlite> {
  if (dbInstance) {
    return dbInstance;
  }
  
  try {
    console.log('Initializing database...');
    
    // Initialize PGlite
    const db = new PGlite();
    
    // Run migrations
    await runMigrations(db);
    
    // Setup offline sync
    await setupOfflineSync(db);
    
    dbInstance = db;
    console.log('Database initialized successfully');
    
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function runMigrations(db: PGlite): Promise<void> {
  // Import and run the proper migrations
  console.log('Running migrations...');
  
  const { migrate } = await import('../db/migrations-client/index.js');
  await migrate(db);
  
  console.log('Migrations completed');
}
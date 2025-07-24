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
  // Run your migrations here
  // This is a placeholder for your actual migration logic
  console.log('Running migrations...');
  
  // Example migration: Create tables if they don't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
      modified TEXT
    )
  `);
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      content TEXT,
      tags TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      created_time TEXT,
      completed_time TEXT,
      start_date TEXT,
      list_id TEXT REFERENCES lists(id)
    )
  `);
  
  console.log('Migrations completed');
}
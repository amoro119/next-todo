// app/offlineSync.ts
import { PGlite } from '@electric-sql/pglite';
import { initOfflineSync, getDbWrapper } from '../lib/sync/initOfflineSync';

let initialized = false;

export async function setupOfflineSync(db: PGlite): Promise<void> {
  if (initialized) {
    return;
  }
  
  try {
    console.log('Setting up offline sync system...');
    
    // Create sync_queue table if it doesn't exist
    await ensureSyncQueueTable(db);
    
    // Initialize offline sync system
    initOfflineSync(db);
    
    initialized = true;
    console.log('Offline sync system setup complete');
  } catch (error) {
    console.error('Failed to setup offline sync system:', error);
    throw error;
  }
}

async function ensureSyncQueueTable(db: PGlite): Promise<void> {
  try {
    // Check if sync_queue table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'sync_queue'
      )
    `);
    
    const tableExists = result.rows[0]?.exists === true;
    
    if (!tableExists) {
      console.log('Creating sync_queue table...');
      
      // Create sync_queue table
      await db.query(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          table_name TEXT NOT NULL,
          operation TEXT NOT NULL,
          record_id TEXT NOT NULL,
          data JSONB NOT NULL,
          timestamp TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 3,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      // Create indexes
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);
      `);
      
      console.log('sync_queue table created successfully');
    } else {
      console.log('sync_queue table already exists');
    }
  } catch (error) {
    console.error('Failed to ensure sync_queue table:', error);
    throw error;
  }
}

// Helper function to get the database wrapper
export function getDatabase(): PGlite | null {
  const wrapper = getDbWrapper();
  return wrapper ? wrapper.raw : null;
}

// Helper function to get the wrapped database for write operations
export function getWrappedDatabase() {
  return getDbWrapper();
}
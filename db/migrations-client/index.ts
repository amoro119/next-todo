// db/migrations-client/index.ts
import { PGlite } from '@electric-sql/pglite'

const migration = `
-- Client-side schema for a local-first setup with ElectricSQL

-- Let ElectricSQL create its own system tables automatically
-- We only define our application tables here

-- # Tables and indexes
-- Note: PGlite does not support generated columns with \`STORED\`. We use triggers to simulate this.
-- The local-first columns are added to tables managed by Electric.

CREATE TABLE IF NOT EXISTS "lists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "is_hidden" BOOLEAN DEFAULT FALSE,
    "modified" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "lists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lists_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "todos" (
  "id" UUID NOT NULL,
  "title" TEXT,
  "completed" BOOLEAN DEFAULT FALSE,
  "deleted" BOOLEAN DEFAULT FALSE,
  "sort_order" INTEGER,
  "due_date" TIMESTAMPTZ,
  "content" TEXT,
  "tags" TEXT,
  "priority" INTEGER DEFAULT 0,
  "created_time" TIMESTAMPTZ DEFAULT NOW(),
  "completed_time" TIMESTAMPTZ,
  "start_date" TIMESTAMPTZ,
  "list_id" UUID,
  
  -- 重复任务相关字段
  "repeat" TEXT, -- RFC 5545 RRULE格式，如 "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15"
  "reminder" TEXT, -- ISO 8601 Duration格式，如 "PT0S"(到期时), "P0DT9H0M0S"(提前9小时)
  "is_recurring" BOOLEAN DEFAULT FALSE,
  "recurring_parent_id" UUID, -- 指向原始重复任务的ID
  "instance_number" INTEGER, -- 实例序号
  "next_due_date" TIMESTAMPTZ, -- 下次到期日期（仅原始任务使用）
  
  CONSTRAINT "todos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "todos_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);

-- Indexes for performance (basic indexes only, recurring task indexes will be created after columns are added)
CREATE INDEX IF NOT EXISTS "lists_id_idx" ON "lists" ("id");
CREATE INDEX IF NOT EXISTS "todos_id_idx" ON "todos" ("id");
CREATE INDEX IF NOT EXISTS "todos_list_id_idx" ON "todos" ("list_id");

-- Insert initial slogan
INSERT INTO "meta" (key, value) VALUES ('slogan', '今日事今日毕，勿将今事待明日!.☕') ON CONFLICT (key) DO NOTHING;

-- Add missing columns to existing tables if they don't exist
-- This must be done before creating triggers that reference these columns
DO $$
BEGIN
    -- Add repeat column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'repeat') THEN
        ALTER TABLE todos ADD COLUMN repeat TEXT;
        RAISE NOTICE 'Added repeat column to todos table';
    END IF;
    
    -- Add reminder column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'reminder') THEN
        ALTER TABLE todos ADD COLUMN reminder TEXT;
        RAISE NOTICE 'Added reminder column to todos table';
    END IF;
    
    -- Add is_recurring column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'is_recurring') THEN
        ALTER TABLE todos ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_recurring column to todos table';
    END IF;
    
    -- Add recurring_parent_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'recurring_parent_id') THEN
        ALTER TABLE todos ADD COLUMN recurring_parent_id UUID;
        RAISE NOTICE 'Added recurring_parent_id column to todos table';
    END IF;
    
    -- Add instance_number column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'instance_number') THEN
        ALTER TABLE todos ADD COLUMN instance_number INTEGER;
        RAISE NOTICE 'Added instance_number column to todos table';
    END IF;
    
    -- Add next_due_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'todos' AND column_name = 'next_due_date') THEN
        ALTER TABLE todos ADD COLUMN next_due_date TIMESTAMPTZ;
        RAISE NOTICE 'Added next_due_date column to todos table';
    END IF;
END $$;

-- Create indexes for recurring task columns (after columns are added)
CREATE INDEX IF NOT EXISTS "idx_todos_repeat" ON "todos" ("repeat") WHERE "repeat" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_reminder" ON "todos" ("reminder") WHERE "reminder" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_recurring_parent" ON "todos" ("recurring_parent_id") WHERE "recurring_parent_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_is_recurring" ON "todos" ("is_recurring") WHERE "is_recurring" = TRUE;
CREATE INDEX IF NOT EXISTS "idx_todos_instance_number" ON "todos" ("instance_number") WHERE "instance_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_next_due_date" ON "todos" ("next_due_date") WHERE "next_due_date" IS NOT NULL;

-- Trigger to handle INSERT conflicts during ElectricSQL sync
CREATE OR REPLACE FUNCTION handle_sync_insert_conflict()
RETURNS TRIGGER AS $$
DECLARE
    is_syncing BOOLEAN;
    has_repeat BOOLEAN := FALSE;
    has_reminder BOOLEAN := FALSE;
    has_is_recurring BOOLEAN := FALSE;
    has_recurring_parent_id BOOLEAN := FALSE;
    has_instance_number BOOLEAN := FALSE;
    has_next_due_date BOOLEAN := FALSE;
BEGIN
    -- The 'electric.syncing' flag is set by the sync process.
    -- We only want this trigger to run for operations coming from Electric.
    -- The 'true' argument means it will return 't' or 'f' even if not set.
    SELECT COALESCE(NULLIF(current_setting('electric.syncing', true), ''), 'false')::boolean INTO is_syncing;

    IF is_syncing THEN
        -- This is an INSERT from Electric. If the row already exists locally
        -- (e.g., created offline), we convert the INSERT into an UPDATE
        -- to avoid a primary key conflict.
        
        IF TG_TABLE_NAME = 'todos' THEN
            -- Check which columns exist
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'repeat'
            ) INTO has_repeat;
            
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'reminder'
            ) INTO has_reminder;
            
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'is_recurring'
            ) INTO has_is_recurring;
            
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'recurring_parent_id'
            ) INTO has_recurring_parent_id;
            
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'instance_number'
            ) INTO has_instance_number;
            
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'todos' AND column_name = 'next_due_date'
            ) INTO has_next_due_date;
            
            -- Build dynamic UPDATE statement based on existing columns
            IF has_repeat AND has_reminder AND has_is_recurring AND has_recurring_parent_id AND has_instance_number AND has_next_due_date THEN
                -- All columns exist, use full update
                UPDATE todos SET
                    title = NEW.title,
                    completed = NEW.completed,
                    deleted = NEW.deleted,
                    sort_order = NEW.sort_order,
                    due_date = NEW.due_date,
                    content = NEW.content,
                    tags = NEW.tags,
                    priority = NEW.priority,
                    created_time = NEW.created_time,
                    completed_time = NEW.completed_time,
                    start_date = NEW.start_date,
                    list_id = NEW.list_id,
                    repeat = NEW.repeat,
                    reminder = NEW.reminder,
                    is_recurring = NEW.is_recurring,
                    recurring_parent_id = NEW.recurring_parent_id,
                    instance_number = NEW.instance_number,
                    next_due_date = NEW.next_due_date
                WHERE id = NEW.id;
            ELSE
                -- Some columns missing, use basic update
                UPDATE todos SET
                    title = NEW.title,
                    completed = NEW.completed,
                    deleted = NEW.deleted,
                    sort_order = NEW.sort_order,
                    due_date = NEW.due_date,
                    content = NEW.content,
                    tags = NEW.tags,
                    priority = NEW.priority,
                    created_time = NEW.created_time,
                    completed_time = NEW.completed_time,
                    start_date = NEW.start_date,
                    list_id = NEW.list_id
                WHERE id = NEW.id;
            END IF;
            
            IF FOUND THEN
                RETURN NULL; -- The update was successful, so we cancel the original INSERT.
            END IF;
        
        ELSIF TG_TABLE_NAME = 'lists' THEN
            UPDATE lists SET
                name = NEW.name,
                sort_order = NEW.sort_order,
                is_hidden = NEW.is_hidden,
                modified = NEW.modified
            WHERE id = NEW.id;

            IF FOUND THEN
                RETURN NULL; -- Cancel the original INSERT.
            END IF;
        END IF;
    END IF;
    
    -- For local operations, or for sync operations that don't conflict,
    -- proceed with the original INSERT.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to the 'todos' table
DROP TRIGGER IF EXISTS todos_handle_sync_insert_conflict_trigger ON todos;
CREATE TRIGGER todos_handle_sync_insert_conflict_trigger
    BEFORE INSERT ON todos
    FOR EACH ROW
    EXECUTE FUNCTION handle_sync_insert_conflict();

-- Apply the trigger to the 'lists' table
DROP TRIGGER IF EXISTS lists_handle_sync_insert_conflict_trigger ON lists;
CREATE TRIGGER lists_handle_sync_insert_conflict_trigger
    BEFORE INSERT ON lists
    FOR EACH ROW
    EXECUTE FUNCTION handle_sync_insert_conflict();
`;

export async function migrate(db: PGlite) {
  // 优化：使用事务批量执行，减少往返次数
  await db.transaction(async (tx) => {
    await tx.exec(migration);
    
    // 在同一事务中创建同步队列表
    console.log('Creating sync queue table...');
    await tx.query(`
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
    
    // 批量创建索引
    await tx.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);
    `);
    
    console.log('Database migration completed successfully');
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function postInitialSync(_db: PGlite) {
  console.log('Post-initial-sync migrations completed (no triggers to enable)')
}

/**
 * 创建同步队列表
 * @param db PGlite 数据库实例
 */
export async function createSyncQueueTable(db: PGlite) {
  console.log('Creating sync queue table...')
  try {
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
    `)
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);`)
    
    console.log('Sync queue table created successfully')
  } catch (error) {
    console.error('Failed to create sync queue table:', error)
    throw error
  }
}
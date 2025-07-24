"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
exports.postInitialSync = postInitialSync;
// 内联SQL内容，避免?raw导入问题
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
  CONSTRAINT "todos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "todos_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "lists_id_idx" ON "lists" ("id");
CREATE INDEX IF NOT EXISTS "todos_id_idx" ON "todos" ("id");
CREATE INDEX IF NOT EXISTS "todos_list_id_idx" ON "todos" ("list_id");

-- Insert initial slogan
INSERT INTO "meta" (key, value) VALUES ('slogan', '今日事今日毕，勿将今事待明日!.☕') ON CONFLICT (key) DO NOTHING;

-- Trigger to handle INSERT conflicts during ElectricSQL sync
CREATE OR REPLACE FUNCTION handle_sync_insert_conflict()
RETURNS TRIGGER AS $$
DECLARE
    is_syncing BOOLEAN;
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
async function migrate(db) {
    await db.exec(migration);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function postInitialSync(_db) {
    console.log('Post-initial-sync migrations completed (no triggers to enable)');
}
//# sourceMappingURL=index.js.map
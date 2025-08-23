// db/migrations-client/index.ts
import { PGlite } from "@electric-sql/pglite";

// 基础表创建 SQL
const createTables = `
-- Client-side schema for a local-first setup with ElectricSQL
-- Let ElectricSQL create its own system tables automatically
-- We only define our application tables here

CREATE TABLE IF NOT EXISTS "lists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "is_hidden" BOOLEAN DEFAULT FALSE,
    "modified" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "lists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lists_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "goals" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "list_id" UUID,
    "start_date" TIMESTAMPTZ,
    "due_date" TIMESTAMPTZ,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_time" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goals_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL
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
  "repeat" TEXT, -- RFC 5545 RRULE格式
  "reminder" TEXT, -- ISO 8601 Duration格式
  "is_recurring" BOOLEAN DEFAULT FALSE,
  "recurring_parent_id" UUID, -- 指向原始重复任务的ID
  "instance_number" INTEGER, -- 实例序号
  "next_due_date" TIMESTAMPTZ, -- 下次到期日期（仅原始任务使用）
  
  -- 目标关联字段
  "goal_id" UUID, -- 关联的目标ID
  "sort_order_in_goal" INTEGER, -- 在目标中的排序
  
  CONSTRAINT "todos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "todos_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL,
  CONSTRAINT "todos_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL,
  CONSTRAINT "todos_recurring_parent_fkey" FOREIGN KEY ("recurring_parent_id") REFERENCES "todos"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);
`;

// 初始数据插入
const insertInitialData = `
INSERT INTO "meta" (key, value) VALUES ('slogan', '今日事今日毕，勿将今事待明日!.☕') ON CONFLICT (key) DO NOTHING;
`;

// 索引创建
const createIndexes = `
-- Indexes for performance
CREATE INDEX IF NOT EXISTS "lists_id_idx" ON "lists" ("id");
CREATE INDEX IF NOT EXISTS "todos_id_idx" ON "todos" ("id");
CREATE INDEX IF NOT EXISTS "todos_list_id_idx" ON "todos" ("list_id");

-- Create indexes for recurring task columns
CREATE INDEX IF NOT EXISTS "idx_todos_repeat" ON "todos" ("repeat") WHERE "repeat" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_reminder" ON "todos" ("reminder") WHERE "reminder" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_recurring_parent" ON "todos" ("recurring_parent_id") WHERE "recurring_parent_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_is_recurring" ON "todos" ("is_recurring") WHERE "is_recurring" = TRUE;
CREATE INDEX IF NOT EXISTS "idx_todos_instance_number" ON "todos" ("instance_number") WHERE "instance_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_todos_next_due_date" ON "todos" ("next_due_date") WHERE "next_due_date" IS NOT NULL;

-- Create indexes for goals
CREATE INDEX IF NOT EXISTS "idx_goals_list_id" ON "goals" ("list_id");
CREATE INDEX IF NOT EXISTS "idx_goals_archived" ON "goals" ("is_archived");
CREATE INDEX IF NOT EXISTS "idx_goals_priority" ON "goals" ("priority");
CREATE INDEX IF NOT EXISTS "idx_goals_due_date" ON "goals" ("due_date") WHERE "due_date" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_goals_created_time" ON "goals" ("created_time");

-- Create indexes for goal-related todos
CREATE INDEX IF NOT EXISTS "idx_todos_goal_id" ON "todos" ("goal_id");
CREATE INDEX IF NOT EXISTS "idx_todos_goal_sort" ON "todos" ("goal_id", "sort_order_in_goal") 
    WHERE "goal_id" IS NOT NULL;
`;

// 外键约束（已在表创建时添加，这里只是确认）
const addForeignKeys = `
-- Foreign key constraints are already added during table creation
-- This step is kept for compatibility but should be empty
SELECT 1; -- No-op query
`;

// 同步队列表
const createSyncQueue = `
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id UUID NOT NULL, -- 改为 UUID 类型
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 改为 TIMESTAMPTZ 类型
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);
`;

// 同步触发器（暂时跳过，PGlite 可能不完全支持 PL/pgSQL）
const syncTriggers = `
-- Sync triggers are skipped for PGlite compatibility
-- ElectricSQL will handle sync conflicts at a higher level
SELECT 1; -- No-op query
`;

export async function migrate(db: PGlite) {
  console.log("Starting database migration...");
  
  try {
    // 步骤 1: 创建基础表
    console.log("Step 1: Creating basic tables...");
    await db.exec(createTables);
    console.log("✓ Basic tables created");

    // 步骤 2: 插入初始数据
    console.log("Step 2: Inserting initial data...");
    await db.exec(insertInitialData);
    console.log("✓ Initial data inserted");

    // 步骤 3: 创建索引
    console.log("Step 3: Creating indexes...");
    await db.exec(createIndexes);
    console.log("✓ Indexes created");

    // 步骤 4: 添加外键约束（已在表创建时添加）
    console.log("Step 4: Adding foreign key constraints...");
    await db.exec(addForeignKeys);
    console.log("✓ Foreign key constraints added");

    // 步骤 5: 创建同步队列表
    console.log("Step 5: Creating sync queue table...");
    await db.exec(createSyncQueue);
    console.log("✓ Sync queue table created");

    // 步骤 6: 创建同步触发器（跳过，PGlite 兼容性）
    console.log("Step 6: Creating sync triggers...");
    await db.exec(syncTriggers);
    console.log("✓ Sync triggers skipped (PGlite compatibility)");

    console.log("🎉 Database migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function postInitialSync(_db: PGlite) {
  console.log("Post-initial-sync migrations completed (no triggers to enable)");
}

/**
 * 创建同步队列表
 * @param db PGlite 数据库实例
 */
export async function createSyncQueueTable(db: PGlite) {
  console.log("Creating sync queue table...");
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
    `);

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_table_record ON sync_queue(table_name, record_id);`
    );

    console.log("Sync queue table created successfully");
  } catch (error) {
    console.error("Failed to create sync queue table:", error);
    throw error;
  }
}
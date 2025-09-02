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

// 架构检查和修复函数
async function checkAndFixSchema(db: PGlite) {
  console.log("🔍 检查现有数据库架构...");
  
  try {
    // 检查 todos 表是否存在以及其结构
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'todos'
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log("📋 发现现有 todos 表，检查字段...");
      
      // 检查 todos 表的列
      const columnsResult = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'todos' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      const existingColumns = columnsResult.rows.map(row => row.column_name);
      console.log("现有字段:", existingColumns);
      
      // 检查是否缺少目标相关字段
      const hasGoalId = existingColumns.includes('goal_id');
      const hasSortOrderInGoal = existingColumns.includes('sort_order_in_goal');
      
      if (!hasGoalId || !hasSortOrderInGoal) {
        console.log("⚠️  检测到缺少目标相关字段，开始修复...");
        
        // 首先确保 goals 表存在（如果 todos 表存在但 goals 表不存在）
        const goalsTableResult = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'goals'
        `);
        
        if (goalsTableResult.rows.length === 0) {
          console.log("➕ 创建 goals 表...");
          await db.exec(`
            CREATE TABLE "goals" (
                "id" UUID NOT NULL,
                "name" TEXT NOT NULL,
                "description" TEXT,
                "list_id" UUID,
                "start_date" TIMESTAMPTZ,
                "due_date" TIMESTAMPTZ,
                "priority" INTEGER NOT NULL DEFAULT 0,
                "created_time" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
                CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
            );
          `);
        }
        
        // 添加缺少的字段
        if (!hasGoalId) {
          console.log("➕ 添加 goal_id 字段...");
          await db.exec(`ALTER TABLE "todos" ADD COLUMN "goal_id" UUID;`);
        }
        
        if (!hasSortOrderInGoal) {
          console.log("➕ 添加 sort_order_in_goal 字段...");
          await db.exec(`ALTER TABLE "todos" ADD COLUMN "sort_order_in_goal" INTEGER;`);
        }
        
        // 添加外键约束（如果不存在）
        try {
          // 先检查外键约束是否已存在
          const constraintsResult = await db.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'todos' 
            AND constraint_type = 'FOREIGN KEY' 
            AND constraint_name = 'todos_goal_id_fkey'
          `);
          
          if (constraintsResult.rows.length === 0) {
            await db.exec(`
              ALTER TABLE "todos" 
              ADD CONSTRAINT "todos_goal_id_fkey" 
              FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL;
            `);
            console.log("✅ 目标外键约束添加成功");
          } else {
            console.log("ℹ️  目标外键约束已存在");
          }
        } catch (error) {
          console.warn("⚠️  目标外键约束添加失败:", error.message);
        }
        
        // 添加 goals 表的 list_id 外键约束（如果不存在）
        try {
          const goalsConstraintsResult = await db.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'goals' 
            AND constraint_type = 'FOREIGN KEY' 
            AND constraint_name = 'goals_list_id_fkey'
          `);
          
          if (goalsConstraintsResult.rows.length === 0) {
            await db.exec(`
              ALTER TABLE "goals" 
              ADD CONSTRAINT "goals_list_id_fkey" 
              FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL;
            `);
            console.log("✅ 目标列表外键约束添加成功");
          }
        } catch (error) {
          console.warn("⚠️  目标列表外键约束添加失败:", error.message);
        }
        
        // 创建索引
        try {
          await db.exec(`
            CREATE INDEX IF NOT EXISTS "idx_todos_goal_id" ON "todos" ("goal_id");
            CREATE INDEX IF NOT EXISTS "idx_todos_goal_sort" ON "todos" ("goal_id", "sort_order_in_goal") 
                WHERE "goal_id" IS NOT NULL;
            CREATE INDEX IF NOT EXISTS "idx_goals_list_id" ON "goals" ("list_id");
            CREATE INDEX IF NOT EXISTS "idx_goals_archived" ON "goals" ("is_archived");
            CREATE INDEX IF NOT EXISTS "idx_goals_priority" ON "goals" ("priority");
            CREATE INDEX IF NOT EXISTS "idx_goals_due_date" ON "goals" ("due_date") WHERE "due_date" IS NOT NULL;
            CREATE INDEX IF NOT EXISTS "idx_goals_created_time" ON "goals" ("created_time");
          `);
          console.log("✅ 目标相关索引创建成功");
        } catch (error) {
          console.warn("⚠️  索引创建失败:", error.message);
        }
        
        console.log("🎉 架构修复完成！");
      } else {
        console.log("✅ 目标相关字段已存在，无需修复");
      }
      
      // 清理现有数据中的无效 UUID 值
      console.log("🧹 清理现有数据中的无效 UUID 值...");
      try {
        // 清理 todos 表中的无效 list_id
        const invalidListIds = await db.query(`
          SELECT id, list_id 
          FROM todos 
          WHERE list_id IS NOT NULL 
          AND list_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        `);
        
        if (invalidListIds.rows.length > 0) {
          console.log(`⚠️  发现 ${invalidListIds.rows.length} 条无效的 list_id 数据，正在清理...`);
          await db.exec(`
            UPDATE todos 
            SET list_id = NULL 
            WHERE list_id IS NOT NULL 
            AND list_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          `);
          console.log("✅ 无效的 list_id 数据已清理");
        }
        
        // 清理 todos 表中的无效 recurring_parent_id
        const invalidRecurringIds = await db.query(`
          SELECT id, recurring_parent_id 
          FROM todos 
          WHERE recurring_parent_id IS NOT NULL 
          AND recurring_parent_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        `);
        
        if (invalidRecurringIds.rows.length > 0) {
          console.log(`⚠️  发现 ${invalidRecurringIds.rows.length} 条无效的 recurring_parent_id 数据，正在清理...`);
          await db.exec(`
            UPDATE todos 
            SET recurring_parent_id = NULL 
            WHERE recurring_parent_id IS NOT NULL 
            AND recurring_parent_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          `);
          console.log("✅ 无效的 recurring_parent_id 数据已清理");
        }
        
        // 清理 todos 表中的无效 goal_id（如果字段存在）
        if (hasGoalId) {
          const invalidGoalIds = await db.query(`
            SELECT id, goal_id 
            FROM todos 
            WHERE goal_id IS NOT NULL 
            AND goal_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          `);
          
          if (invalidGoalIds.rows.length > 0) {
            console.log(`⚠️  发现 ${invalidGoalIds.rows.length} 条无效的 goal_id 数据，正在清理...`);
            await db.exec(`
              UPDATE todos 
              SET goal_id = NULL 
              WHERE goal_id IS NOT NULL 
              AND goal_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            `);
            console.log("✅ 无效的 goal_id 数据已清理");
          }
        }
        
        // 清理 goals 表中的无效 list_id（如果表存在）
        const goalsTableExists = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'goals'
        `);
        
        if (goalsTableExists.rows.length > 0) {
          // 首先检查所有可能的无效数据类型
          const allGoalsData = await db.query(`
            SELECT id, list_id, pg_typeof(list_id) as list_id_type
            FROM goals 
            WHERE list_id IS NOT NULL
          `);
          
          console.log(`📊 goals 表中的 list_id 数据类型分析:`);
          const typeCount = {};
          allGoalsData.rows.forEach(row => {
            const type = typeof row.list_id;
            typeCount[type] = (typeCount[type] || 0) + 1;
            if (type !== 'string' || !row.list_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
              console.log(`   ⚠️  ID: ${row.id}, list_id: ${row.list_id} (类型: ${type})`);
            }
          });
          
          Object.entries(typeCount).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} 条记录`);
          });
          
          // 使用更强的清理逻辑，包括类型检查
          const invalidGoalsListIds = await db.query(`
            SELECT id, list_id 
            FROM goals 
            WHERE list_id IS NOT NULL 
            AND (
              pg_typeof(list_id) != 'text'::regtype 
              OR list_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          `);
          
          if (invalidGoalsListIds.rows.length > 0) {
            console.log(`⚠️  发现 ${invalidGoalsListIds.rows.length} 条无效的 goals.list_id 数据，正在清理...`);
            
            // 逐条清理，以便更好地处理类型转换问题
            for (const row of invalidGoalsListIds.rows) {
              try {
                await db.exec(`UPDATE goals SET list_id = NULL WHERE id = '${row.id}'`);
                console.log(`   ✅ 清理了 goal ${row.id} 的无效 list_id: ${row.list_id}`);
              } catch (error) {
                console.warn(`   ⚠️  清理 goal ${row.id} 失败:`, error.message);
              }
            }
            
            console.log("✅ 无效的 goals.list_id 数据已清理");
          } else {
            console.log("✅ goals 表中没有发现无效的 list_id 数据");
          }
        }
        
        console.log("✅ 数据清理完成");
      } catch (error) {
        console.warn("⚠️  数据清理失败:", error.message);
      }
    } else {
      console.log("ℹ️  todos 表不存在，将通过正常迁移创建");
    }
    
  } catch (error) {
    console.error("❌ 架构检查失败:", error);
    // 不抛出错误，让正常迁移继续进行
    console.log("⚠️  架构检查失败，继续执行正常迁移流程");
  }
}

export async function migrate(db: PGlite) {
  console.log("Starting database migration...");
  
  try {
    // 步骤 0: 检查并修复现有架构
    console.log("Step 0: Checking and fixing existing schema...");
    await checkAndFixSchema(db);
    console.log("✓ Schema check and fix completed");

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
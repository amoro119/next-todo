// db/migrations-client/index.ts
import { PGlite } from '@electric-sql/pglite'

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
`

export async function migrate(db: PGlite) {
  await db.exec(migration)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function postInitialSync(_db: PGlite) {
  console.log('Post-initial-sync migrations completed (no triggers to enable)')
}
// supabase/functions/write-server/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod';
import jwt from 'jsonwebtoken';

// 本地 schema 定义
const listChangeSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  is_hidden: z.boolean().nullable().optional(),
  // local-first fields
  modified_columns: z.array(z.string()).nullable().optional(),
  new: z.boolean().nullable().optional(),
})
type ListChange = z.infer<typeof listChangeSchema>

const todoChangeSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  completed: z.boolean().nullable().optional(),
  deleted: z.boolean().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  created_time: z.string().nullable().optional(),
  completed_time: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  list_id: z.string().nullable().optional(),
  // local-first fields
  modified_columns: z.array(z.string()).nullable().optional(),
  new: z.boolean().nullable().optional(),
})
type TodoChange = z.infer<typeof todoChangeSchema>

const changeSetSchema = z.object({
  lists: z.array(listChangeSchema),
  todos: z.array(todoChangeSchema),
})
type ChangeSet = z.infer<typeof changeSetSchema>

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || "e8b1c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";



const app = new Hono();

// 简化的 CORS 配置
app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
}));

// 处理所有 OPTIONS 请求
app.options('/*', (c) => {
  return c.newResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
});

// 简单的 GET 路由 - 匹配所有路径
app.get('*', (c) => c.text('Write-server is operational.'));

// 完整的 POST 路由 - 处理数据写入
app.post('*', async (c) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Supabase environment variables not set' }, 500);
  }

  try {
    // 获取并验证 Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    // 提取 token
    const token = authHeader.replace('Bearer ', '');

    // 使用 jsonwebtoken 校验 JWT
    let claims;
    try {
      claims = jwt.verify(token, AUTH_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      console.warn("JWT verification failed:", err.message);
      return c.json({ error: 'Invalid token' }, 401);
    }

    console.log('Token verified successfully', claims);

    const content = await c.req.json();
    const parsedChanges = changeSetSchema.parse(content);

    console.log('Parsed changes:', JSON.stringify(parsedChanges, null, 2));

    // 使用 Supabase 客户端，但不依赖 JWT 验证
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey
    );

    await applyChanges(parsedChanges, supabaseClient);

    return c.json({ success: true });

  } catch (error) {
    console.error('Error processing changes:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return c.json({ 
      error: errorMessage,
      details: error instanceof Error ? error.stack : undefined
    }, error instanceof z.ZodError ? 400 : 500);
  }
});

async function applyChanges(changes: ChangeSet, supabase: SupabaseClient) {
  const { lists, todos } = changes;
  
  for (const list of lists) {
    await applyTableChange('lists', list, supabase);
  }
  for (const todo of todos) {
    await applyTableChange('todos', todo, supabase);
  }
}

async function applyTableChange(
  tableName: 'lists' | 'todos',
  change: ListChange | TodoChange,
  supabase: SupabaseClient
) {
  const { id, modified_columns, new: isNew, ...data } = change as Record<string, unknown>;

  // 过滤掉远程数据库不存在的列
  const { new: _new, modified_columns: _mc, ...cleanData } = data as Record<string, unknown>;

  // 检查是否为删除操作（对于lists表，如果modified_columns为空且不是新记录，则认为是删除）
  const isEmptyUpdate = !modified_columns || modified_columns.length === 0;
  const isDeleteOperation = isEmptyUpdate && !isNew;

  if (isDeleteOperation) {
    // 执行删除操作
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw new Error(`Failed to delete from ${tableName}: ${error.message}`);
    return;
  }

  // 对于 todos 表，处理 deleted 字段
  if (tableName === 'todos') {
    const { deleted: isDeletedFlag } = change as TodoChange;
    const isPermanentDelete = isDeletedFlag && (!modified_columns || modified_columns.length === 0);

    if (isPermanentDelete) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw new Error(`Failed to delete from ${tableName}: ${error.message}`);
      return;
    }
  }
  
  // 为 lists 表添加 modified 时间戳
  if (tableName === 'lists') {
    (cleanData as ListChange).modified = new Date().toISOString();
  }
  
  // 确保 id 字段包含在 upsert 数据中
  const upsertData = { id, ...cleanData };
  
  const { error } = await supabase.from(tableName).upsert(upsertData);
  if (error) {
    throw new Error(`Failed to upsert into ${tableName}: ${error.message}`);
  }
}

// 使用标准的 Deno.serve 格式
Deno.serve(async (req) => {
  return app.fetch(req);
});
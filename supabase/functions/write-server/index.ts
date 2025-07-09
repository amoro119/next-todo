// supabase/functions/write-server/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { changeSetSchema, ListChange, TodoChange, ChangeSet } from '../_shared/schemas.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

const app = new Hono();

// --- 安全的 CORS 配置 ---
const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:3000', // 本地开发
  /app:\/\// // 允许所有来自 Electron 的请求 (app://.)
];

if (Deno.env.get('PRODUCTION_APP_URL')) {
    allowedOrigins.push(Deno.env.get('PRODUCTION_APP_URL')!);
}

app.use('/apply-changes', cors({
  origin: allowedOrigins,
  allowHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
  allowMethods: ['POST', 'OPTIONS'],
}));

app.get('/', (c) => c.text('Write-server is operational.'));

app.post('/apply-changes', async (c) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Supabase environment variables not set' }, 500);
  }

  try {
    const content = await c.req.json();
    const parsedChanges = changeSetSchema.parse(content);
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: c.req.header('Authorization')! } } }
    );

    await applyChanges(parsedChanges, supabaseClient);
    
    return c.json({ success: true });

  } catch (error) {
    console.error('Error processing changes:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return c.json({ error: errorMessage }, error instanceof z.ZodError ? 400 : 500);
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
  const { id, deleted: isDeletedFlag, modified_columns } = change;

  const isPermanentDelete = isDeletedFlag && (!modified_columns || modified_columns.length === 0);

  if (isPermanentDelete) {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw new Error(`Failed to delete from ${tableName}: ${error.message}`);
    return;
  }
  
  const { new: _n, modified_columns: _mc, ...data } = change as any;
  if (tableName === 'lists') {
    (data as ListChange).modified = new Date().toISOString();
  }
  
  const { error } = await supabase.from(tableName).upsert(data);
  if (error) {
    throw new Error(`Failed to upsert into ${tableName}: ${error.message}`);
  }
}

Deno.serve(app.fetch);
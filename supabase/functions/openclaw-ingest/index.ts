// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod';
import { authError, verifyAuth } from './auth.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

// Schema for create action
const createTaskSchema = z.object({
  action: z.literal('create'),
  event_id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  due_date: z.string().datetime().optional(),
  start_date: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(3).optional().default(0),
  tags: z.string().optional(),
  list_id: z.string().uuid().optional(),
  list_name: z.string().optional(),
  source: z.string().optional(),
});

// Schema for complete action
const completeTaskSchema = z.object({
  action: z.literal('complete'),
  task_id: z.string().uuid(),
});

// Schema for query action
const queryTaskSchema = z.object({
  action: z.literal('query'),
  task_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'completed', 'all']).optional().default('all'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Union schema for all actions
const requestSchema = z.union([createTaskSchema, completeTaskSchema, queryTaskSchema]);

type CreateTaskRequest = z.infer<typeof createTaskSchema>;
type CompleteTaskRequest = z.infer<typeof completeTaskSchema>;
type QueryTaskRequest = z.infer<typeof queryTaskSchema>;

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
}));

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

app.get('*', (c) => c.text('OpenClaw ingest is operational. Use POST with action field: "create" or "complete"'));

app.post('*', async (c) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Supabase environment variables not set' }, 500);
  }

  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return authError();
  }

  let authResult;
  try {
    authResult = await verifyAuth(authHeader);
  } catch {
    return authError();
  }

  const { supabase } = authResult;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const actionCheck = z.object({ action: z.string() }).safeParse(body);
  if (!actionCheck.success) {
    return c.json({ error: 'Missing or invalid "action" field. Use "create", "complete", or "query".' }, 400);
  }

  const { action } = actionCheck.data;

  if (action === 'create') {
    return handleCreateTask(c, body as CreateTaskRequest, supabase);
  } else if (action === 'complete') {
    return handleCompleteTask(c, body as CompleteTaskRequest, supabase);
  } else if (action === 'query') {
    return handleQueryTask(c, body as QueryTaskRequest, supabase);
  } else {
    return c.json({ error: `Unknown action: "${action}". Use "create", "complete", or "query".` }, 400);
  }
});

async function handleCreateTask(c: any, body: unknown, supabase: any) {
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return c.json({ error: errorMsg }, 400);
  }

  // Check for existing event
  const { data: existingEvent, error: eventQueryError } = await supabase
    .from('openclaw_events')
    .select('id, status, task_id')
    .eq('event_id', requestData.event_id)
    .maybeSingle();

  if (eventQueryError) {
    return c.json({ error: 'Failed to check event status' }, 500);
  }

  if (existingEvent && existingEvent.status === 'processed') {
    return c.json({
      success: true,
      task_id: existingEvent.task_id,
      status: 'ignored_duplicate',
      deduplicated: true,
    });
  }

  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const todoData: any = {
    id: taskId,
    title: requestData.title,
    completed: false,
    deleted: false,
    priority: requestData.priority,
    created_time: now,
    list_id: requestData.list_id ?? null,
    content: requestData.content ?? null,
    due_date: requestData.due_date ?? null,
    start_date: requestData.start_date ?? null,
    tags: requestData.tags ?? null,
  };

  const { error: insertError } = await supabase.from('todos').insert(todoData);

  if (insertError) {
    await supabase.from('openclaw_events').upsert({
      event_id: requestData.event_id,
      source: requestData.source ?? null,
      status: 'failed',
      task_id: null,
      error_message: insertError.message,
      received_at: now,
      processed_at: new Date().toISOString(),
      payload: requestData,
    }, { onConflict: 'event_id' });

    return c.json({ error: 'Failed to create task' }, 500);
  }

  await supabase.from('openclaw_events').upsert({
    event_id: requestData.event_id,
    source: requestData.source ?? null,
    status: 'processed',
    task_id: taskId,
    error_message: null,
    received_at: now,
    processed_at: new Date().toISOString(),
    payload: requestData,
  }, { onConflict: 'event_id' });

  return c.json({
    success: true,
    task_id: taskId,
    status: 'created',
    deduplicated: false,
  });
}

async function handleCompleteTask(c: any, body: unknown, supabase: any) {
  const parsed = completeTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const { task_id } = parsed.data;

  const { data: task, error: fetchError } = await supabase
    .from('todos')
    .select('id, completed, deleted')
    .eq('id', task_id)
    .maybeSingle();

  if (fetchError) {
    return c.json({ error: fetchError.message }, 500);
  }

  if (!task || task.deleted) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (task.completed) {
    return c.json({
      deduplicated: true,
      status: 'already_completed',
    }, 200);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('todos')
    .update({
      completed: true,
      completed_time: now,
      modified: now,
    })
    .eq('id', task_id);

  if (updateError) {
    return c.json({ error: updateError.message }, 500);
  }

  return c.json({
    success: true,
    task_id,
    status: 'completed',
  });
}

async function handleQueryTask(c: any, body: unknown, supabase: any) {
  const parsed = queryTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const { task_id, status, limit } = parsed.data;

  // If task_id is provided, query specific task
  if (task_id) {
    const { data: task, error: fetchError } = await supabase
      .from('todos')
      .select('id, title, completed, deleted, priority, due_date, content, tags, created_time, completed_time')
      .eq('id', task_id)
      .maybeSingle();

    if (fetchError) {
      return c.json({ error: fetchError.message }, 500);
    }

    if (!task || task.deleted) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json({
      success: true,
      task,
    });
  }

  // Query multiple tasks based on status
  let query = supabase
    .from('todos')
    .select('id, title, completed, deleted, priority, due_date, content, tags, created_time, completed_time')
    .eq('deleted', false)
    .order('created_time', { ascending: false })
    .limit(limit);

  if (status === 'pending') {
    query = query.eq('completed', false);
  } else if (status === 'completed') {
    query = query.eq('completed', true);
  }

  const { data: tasks, error: queryError } = await query;

  if (queryError) {
    return c.json({ error: queryError.message }, 500);
  }

  return c.json({
    success: true,
    tasks: tasks || [],
    count: tasks?.length || 0,
    status: status,
  });
}

Deno.serve(async (req) => app.fetch(req));

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

// Schema for update action
const updateTaskSchema = z.object({
  action: z.literal('update'),
  task_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  due_date: z.string().datetime().optional(),
  start_date: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  tags: z.string().optional(),
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
  limit: z.number().int().min(1).optional(),
});

// Schema for digest action
const digestTaskSchema = z.object({
  action: z.literal('digest'),
  limit: z.number().int().min(1).optional(),
});

// Union schema for all actions
const requestSchema = z.union([createTaskSchema, updateTaskSchema, completeTaskSchema, queryTaskSchema, digestTaskSchema]);

type CreateTaskRequest = z.infer<typeof createTaskSchema>;
type UpdateTaskRequest = z.infer<typeof updateTaskSchema>;
type CompleteTaskRequest = z.infer<typeof completeTaskSchema>;
type QueryTaskRequest = z.infer<typeof queryTaskSchema>;
type DigestTaskRequest = z.infer<typeof digestTaskSchema>;

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

  app.get('*', (c) => c.text('OpenClaw ingest is operational. Use POST with action field: "create", "update", "complete", "query", or "digest"'));

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
    return c.json({ error: 'Missing or invalid "action" field. Use "create", "update", "complete", "query", or "digest".' }, 400);
  }

  const { action } = actionCheck.data;

  if (action === 'create') {
    return handleCreateTask(c, body as CreateTaskRequest, supabase);
  } else if (action === 'update') {
    return handleUpdateTask(c, body as UpdateTaskRequest, supabase);
  } else if (action === 'complete') {
    return handleCompleteTask(c, body as CompleteTaskRequest, supabase);
  } else if (action === 'query') {
    return handleQueryTask(c, body as QueryTaskRequest, supabase);
  } else if (action === 'digest') {
    return handleDigestTask(c, body as DigestTaskRequest, supabase);
  } else {
    return c.json({ error: `Unknown action: "${action}". Use "create", "update", "complete", "query", or "digest".` }, 400);
  }
});

function convertToUTC0(dateTimeStr: string | undefined): string | null {
  if (!dateTimeStr) return null;

  try {
    // 处理纯日期格式 "2026-03-31"（东八区日期）
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
      const [year, month, day] = dateTimeStr.split('-').map(Number);
      // 东八区当天零点 = UTC 前一天 16:00
      const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString();
    }

    // 处理带时区的日期时间格式
    const normalizedStr = dateTimeStr.replace(' ', 'T');
    const d = new Date(normalizedStr);
    if (isNaN(d.getTime())) return null;

    // 如果输入没有时区信息，假定为东八区时间，减去 8 小时转 UTC
    const utcTimestamp = d.getTime() - (8 * 60 * 60 * 1000);
    return new Date(utcTimestamp).toISOString();
  } catch {
    return null;
  }
}

async function handleUpdateTask(c: any, body: unknown, supabase: any) {
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return c.json({ error: errorMsg }, 400);
  }

  const { task_id, title, content, due_date, start_date, priority, tags } = parsed.data;

  // Check if task exists and is not deleted
  const { data: task, error: fetchError } = await supabase
    .from('todos')
    .select('id, deleted')
    .eq('id', task_id)
    .maybeSingle();

  if (fetchError) {
    return c.json({ error: fetchError.message }, 500);
  }

  if (!task || task.deleted) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // Build update data with only provided fields
  const updateData: any = {
    modified: new Date().toISOString(),
  };

  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (due_date !== undefined) updateData.due_date = convertToUTC0(due_date);
  if (start_date !== undefined) updateData.start_date = convertToUTC0(start_date);
  if (priority !== undefined) updateData.priority = priority;
  if (tags !== undefined) updateData.tags = tags;

  const { error: updateError } = await supabase
    .from('todos')
    .update(updateData)
    .eq('id', task_id);

  if (updateError) {
    return c.json({ error: updateError.message }, 500);
  }

  return c.json({
    success: true,
    task_id,
    status: 'updated',
  });
}

async function handleCreateTask(c: any, body: unknown, supabase: any) {
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return c.json({ error: errorMsg }, 400);
  }

  const requestData = parsed.data;

  if (requestData.due_date && !requestData.start_date) {
    requestData.start_date = requestData.due_date;
  } else if (requestData.start_date && !requestData.due_date) {
    requestData.due_date = requestData.start_date;
  } else if (!requestData.start_date && !requestData.due_date) {
    const now = new Date();
    const todayUTC8 = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    requestData.start_date = `${todayUTC8}T00:00:00`;
    requestData.due_date = `${todayUTC8}T23:59:59`;
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
    due_date: convertToUTC0(requestData.due_date),
    start_date: convertToUTC0(requestData.start_date),
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

// Convert UTC datetime string to Asia/Shanghai (UTC+8) format
function convertToUTC8(utcDateStr: string | null | undefined): string | null {
  if (!utcDateStr) return null;
  try {
    const d = new Date(utcDateStr);
    if (isNaN(d.getTime())) return null;
    // Add 8 hours to convert UTC+0 to UTC+8
    const utc8Timestamp = d.getTime() + (8 * 60 * 60 * 1000);
    return new Date(utc8Timestamp).toISOString();
  } catch {
    return null;
  }
}

// Transform task dates from UTC+0 to UTC+8 (only due_date and start_date)
function transformTaskToUTC8(task: any): any {
  return {
    ...task,
    due_date: convertToUTC8(task.due_date),
    start_date: convertToUTC8(task.start_date),
  };
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
      .select('id, title, completed, deleted, priority, due_date, content, tags, created_time, completed_time, modified, start_date')
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
      task: transformTaskToUTC8(task),
    });
  }

  // Query multiple tasks based on status
  let query = supabase
    .from('todos')
    .select('id, title, completed, deleted, priority, due_date, content, tags, created_time, completed_time, modified, start_date')
    .eq('deleted', false)
    .order('created_time', { ascending: false });

  // Only apply limit if provided
  if (limit) {
    query = query.limit(limit);
  }

  if (status === 'pending') {
    query = query.eq('completed', false);
  } else if (status === 'completed') {
    query = query.eq('completed', true);
  }

  const { data: tasks, error: queryError } = await query;

  if (queryError) {
    return c.json({ error: queryError.message }, 500);
  }

  // Transform all tasks to UTC+8
  const transformedTasks = (tasks || []).map(transformTaskToUTC8);

  return c.json({
    success: true,
    tasks: transformedTasks,
    count: transformedTasks.length,
    status: status,
  });
}

async function handleDigestTask(c: any, body: unknown, supabase: any) {
  const parsed = digestTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const { limit } = parsed.data;

  const now = new Date();
  const todayUTC8 = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = supabase
    .from('todos')
    .select('id, title, completed, deleted, priority, due_date, content, tags, created_time, completed_time, modified, start_date')
    .eq('deleted', false)
    .eq('completed', false)
    .order('created_time', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: tasks, error: queryError } = await query;

  if (queryError) {
    return c.json({ error: queryError.message }, 500);
  }

  const transformedTasks = (tasks || []).map(transformTaskToUTC8);

  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = today.toISOString().slice(0, 10);

  const overdueTasks = transformedTasks.filter((t: any) => {
    if (!t.due_date) return false;
    return t.due_date.slice(0, 10) < todayStr;
  });

  const dueTodayTasks = transformedTasks.filter((t: any) => {
    return t.due_date?.startsWith(todayStr);
  });

  const upcomingTasks = transformedTasks.filter((t: any) => {
    if (!t.due_date) return true;
    const due = t.due_date.slice(0, 10);
    return due > todayStr;
  });

  function formatDueDate(dueDate: string | null | undefined): string {
    if (!dueDate) return '';
    const d = new Date(dueDate);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${month}-${day}`;
  }

  function formatTask(t: any): string {
    if (t.due_date) {
      return `  ○ ${t.title} [截止: ${formatDueDate(t.due_date)}]`;
    } else {
      return `  ○ ${t.title}（无截止日）`;
    }
  }

  const summaryLines: string[] = [];
  summaryLines.push('📋 今日任务摘要');
  summaryLines.push('===============');

  if (overdueTasks.length > 0) {
    summaryLines.push('');
    summaryLines.push(`⚠️ 已过期 ${overdueTasks.length} 个`);
    overdueTasks.forEach((t: any) => summaryLines.push(formatTask(t)));
  }

  if (dueTodayTasks.length > 0) {
    summaryLines.push('');
    summaryLines.push(`📅 今日截止 ${dueTodayTasks.length} 个`);
    dueTodayTasks.forEach((t: any) => summaryLines.push(formatTask(t)));
  }

  if (upcomingTasks.length > 0) {
    summaryLines.push('');
    summaryLines.push('📝 近期待办');
    upcomingTasks.slice(0, 10).forEach((t: any) => summaryLines.push(formatTask(t)));
  }

  if (overdueTasks.length === 0 && dueTodayTasks.length === 0 && upcomingTasks.length === 0) {
    summaryLines.push('');
    summaryLines.push('🎉 没有待办任务，享受你的自由时间！');
  }

  return c.json({
    success: true,
    digest: {
      date: todayUTC8,
      summary: summaryLines.join('\n'),
      stats: {
        total: transformedTasks.length,
        pending: transformedTasks.length,
        due_today: dueTodayTasks.length,
        overdue: overdueTasks.length,
      },
      tasks: transformedTasks.slice(0, 10).map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        due_date: t.due_date,
      })),
    },
  });
}

Deno.serve(async (req) => app.fetch(req));

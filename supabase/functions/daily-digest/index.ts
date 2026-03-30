// supabase/functions/daily-digest/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod';
import { authError, verifyAuth } from './auth.ts';

// ========== Zod Schemas ==========
const digestRunSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().optional().default("Asia/Shanghai"),
  target: z.string().optional(),
});

type DigestRunRequest = z.infer<typeof digestRunSchema>;

interface TodoSummary {
  total: number;
  dueToday: number;
  overdue: number;
  highPriorityTodos: { title: string; priority: number }[];
}

// ========== Environment Variables ==========
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const OPENCLAW_BASE_URL = Deno.env.get('OPENCLAW_BASE_URL');
const OPENCLAW_APP_ID = Deno.env.get('OPENCLAW_APP_ID');
const OPENCLAW_SECRET = Deno.env.get('OPENCLAW_SECRET');

// ========== Hono App Setup ==========
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

app.get('*', (c) => c.text('Daily digest service is operational. Use POST to run digest.'));

// ========== Main POST Endpoint ==========
app.post('*', async (c) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Supabase environment variables not set' }, 500);
  }

  try {
    // 1. Auth Verification (supports Anon Key or User JWT)
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return authError();
    }

    let authResult;
    try {
      authResult = await verifyAuth(authHeader);
    } catch (err) {
      console.warn("Auth verification failed:", err instanceof Error ? err.message : err);
      return authError();
    }

    const { supabase: supabaseClient } = authResult;

    // 2. Parse request body
    const body = await c.req.json();
    const parsedRequest = digestRunSchema.parse(body);
    const { date, timezone, target } = parsedRequest;

    // Determine digest date (default to today in specified timezone)
    const digestDate = date || getDateInTimezone(timezone);

    // 3. Query todo summary
    const summary = await queryTodoSummary(supabaseClient, digestDate, timezone);

    // 4. Build digest text
    const digestText = buildDigestText(summary, digestDate);

    // If no todos, return early with a message
    if (summary.total === 0) {
      await logDelivery(supabaseClient, digestDate, target || 'default', 'skipped', null, '无待办任务');
      return c.json({
        success: true,
        digest_date: digestDate,
        message: '无待办任务',
        sent: 0,
        failed: 0
      });
    }

    // 5. Push to OpenClaw
    const pushResult = await pushToOpenClaw(digestText, digestDate);

    // 6. Log delivery result
    if (pushResult.success) {
      await logDelivery(supabaseClient, digestDate, target || 'default', 'sent', null);
    } else {
      await logDelivery(supabaseClient, digestDate, target || 'default', 'failed', pushResult.error ?? null);
    }

    // 7. Return response
    return c.json({
      success: pushResult.success,
      digest_date: digestDate,
      sent: pushResult.success ? 1 : 0,
      failed: pushResult.success ? 0 : 1,
      ...(pushResult.error && { error: pushResult.error })
    });

  } catch (error) {
    console.error('Error processing digest:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const isZodError = error instanceof z.ZodError;
    return c.json({
      error: errorMessage,
      details: isZodError ? (error as z.ZodError).errors : undefined
    }, isZodError ? 400 : 500);
  }
});

// ========== Helper Functions ==========

function getDateInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

function getTimeBoundaries(dateStr: string, timezone: string): { start: Date; end: Date } {
  // Parse date string (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create boundaries in the specified timezone
  // For Asia/Shanghai (UTC+8), we need to adjust
  const tzOffset = timezone === 'Asia/Shanghai' ? 8 : 0; // UTC+8 for Shanghai

  // Start of day (00:00:00 local time)
  const start = new Date(Date.UTC(year, month - 1, day, -tzOffset, 0, 0, 0));
  // End of day (23:59:59.999 local time = start of next day)
  const end = new Date(Date.UTC(year, month - 1, day + 1, -tzOffset, 0, 0, 0));

  return { start, end };
}

async function queryTodoSummary(
  supabase: SupabaseClient,
  dateStr: string,
  timezone: string
): Promise<TodoSummary> {
  const { start, end } = getTimeBoundaries(dateStr, timezone);

  const { count: total, error: totalError } = await supabase
    .from('todos')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .eq('deleted', false);

  if (totalError) {
    console.error('Error querying total todos:', totalError);
    throw new Error(`Failed to query total todos: ${totalError.message}`);
  }

  const { count: dueToday, error: dueTodayError } = await supabase
    .from('todos')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .eq('deleted', false)
    .gte('due_date', start.toISOString())
    .lt('due_date', end.toISOString());

  if (dueTodayError) {
    console.error('Error querying due today:', dueTodayError);
  }

  const { count: overdue, error: overdueError } = await supabase
    .from('todos')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .eq('deleted', false)
    .lt('due_date', start.toISOString());

  if (overdueError) {
    console.error('Error querying overdue:', overdueError);
  }

  const { data: highPriorityData, error: highPriorityError } = await supabase
    .from('todos')
    .select('title, priority')
    .eq('completed', false)
    .eq('deleted', false)
    .gte('priority', 2)
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })
    .limit(5);

  if (highPriorityError) {
    console.error('Error querying high priority:', highPriorityError);
  }

  const { count: highPriorityTotal, error: highPriorityTotalError } = await supabase
    .from('todos')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .eq('deleted', false)
    .gte('priority', 2);

  if (highPriorityTotalError) {
    console.error('Error querying high priority total:', highPriorityTotalError);
  }

  return {
    total: total || 0,
    dueToday: dueToday || 0,
    overdue: overdue || 0,
    highPriorityTodos: (highPriorityData || []).map((t: { title: string; priority: number }) => ({
      title: t.title,
      priority: t.priority
    })),
    highPriorityTotal: highPriorityTotal || 0
  } as TodoSummary & { highPriorityTotal: number };
}

function buildDigestText(
  summary: TodoSummary & { highPriorityTotal?: number },
  dateStr: string
): string {
  // Format date as MM-DD
  const [, month, day] = dateStr.split('-');
  const dateDisplay = `${month}-${day}`;

  let text = `今日待办摘要（${dateDisplay}）\n`;
  text += `未完成：${summary.total}\n`;
  text += `今日到期：${summary.dueToday}（逾期：${summary.overdue}）\n`;

  if (summary.highPriorityTodos.length > 0) {
    text += '高优先级：\n';
    summary.highPriorityTodos.forEach((todo, index) => {
      text += `${index + 1}) ${todo.title}\n`;
    });

    // If more than 5 high priority todos, append summary
    const total = summary.highPriorityTotal || summary.highPriorityTodos.length;
    if (total > 5) {
      text += `... 等共 ${total} 条高优先级任务\n`;
    }
  }

  return text.trim();
}

async function pushToOpenClaw(
  message: string,
  digestDate: string
): Promise<{ success: boolean; error?: string }> {
  // Check if OpenClaw environment variables are configured
  if (!OPENCLAW_BASE_URL || !OPENCLAW_APP_ID || !OPENCLAW_SECRET) {
    console.warn('OpenClaw environment variables not configured');
    return {
      success: false,
      error: 'OpenClaw environment variables not configured (OPENCLAW_BASE_URL, OPENCLAW_APP_ID, OPENCLAW_SECRET)'
    };
  }

  try {
    const response = await fetch(`${OPENCLAW_BASE_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: OPENCLAW_APP_ID,
        secret: OPENCLAW_SECRET,
        message,
        digest_date: digestDate,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenClaw push failed:', response.status, errorText);
      return {
        success: false,
        error: `OpenClaw API error: ${response.status} - ${errorText}`
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('OpenClaw push error:', errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}

async function logDelivery(
  supabase: SupabaseClient,
  digestDate: string,
  target: string,
  status: 'sent' | 'failed' | 'skipped',
  errorMessage: string | null,
  message?: string
): Promise<void> {
  try {
    await supabase.from('digest_delivery_logs').insert({
      digest_date: digestDate,
      target: target,
      status: status,
      attempt: 1,
      error_message: errorMessage || message,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log delivery:', err);
    // Don't throw - logging failure shouldn't break the response
  }
}

// ========== Server ==========
Deno.serve(async (req) => {
  return app.fetch(req);
});
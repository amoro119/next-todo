import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';

const app = new Hono();
app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

const retired = (c: any) => c.json({
  error: 'upgrade-required',
  protocol_version: 2,
  message: 'Direct table writes are retired. Use sync_apply_change RPC.',
}, 410);

app.get('*', retired);
app.post('*', retired);

Deno.serve((request) => app.fetch(request));

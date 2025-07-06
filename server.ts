// server.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import postgres from 'postgres'
import {
  ChangeSet,
  changeSetSchema,
  ListChange,
  TodoChange,
} from './lib/changes'
import { serve } from '@hono/node-server'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:password@localhost:54321/next_todo'

// Create postgres connection
const sql = postgres(DATABASE_URL)

const app = new Hono()

// Middleware
app.use('/*', cors())

// Routes
app.get('/', async (c) => {
  const result = await sql`
    SELECT 'ok' as status, version() as postgres_version, now() as server_time
  `
  return c.json(result[0])
})

app.post('/apply-changes', async (c) => {
  const content = await c.req.json()
  let parsedChanges: ChangeSet
  try {
    parsedChanges = changeSetSchema.parse(content)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Invalid changes' }, 400)
  }
  try {
    await applyChanges(parsedChanges)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to apply changes' }, 500)
  }
  return c.json({ success: true })
})

// Start the server
const port = 3001
console.log(`Write-through server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})

async function applyChanges(changes: ChangeSet) {
  const { lists, todos } = changes
  await sql.begin(async (sql) => {
    for (const list of lists) {
      await applyTableChange('lists', list, sql)
    }
    for (const todo of todos) {
      await applyTableChange('todos', todo, sql)
    }
  })
}

async function applyTableChange(
  tableName: 'lists' | 'todos',
  change: ListChange | TodoChange,
  sql: postgres.TransactionSql
): Promise<void> {
  const {
    id,
    new: isNew,
    deleted: isDeletedFlag,
    modified_columns
  } = change;

  // A permanent delete is signaled by `deleted: true` and an empty `modified_columns` array.
  // A soft delete will have `deleted: true` and `modified_columns: ['deleted', ...]`.
  const isPermanentDelete = isDeletedFlag && (!modified_columns || modified_columns.length === 0);

  if (isPermanentDelete) {
    await sql`
      DELETE FROM ${sql(tableName)} WHERE id = ${id}::uuid
    `;
    return;
  }

  // Handle inserts and updates (including soft-deletes/restores).
  // We remove local-first helper fields but keep the `deleted` field for updates.
  const { new: _n, modified_columns: _mc, ...data } = change as any;

  if (isNew) {
    // If it's a new record, perform an "upsert".
    const columns = Object.keys(data);
    if (tableName === 'lists') {
      data.modified = new Date();
    }
    
    await sql`
      INSERT INTO ${sql(tableName)} ${sql(data, ...columns)}
      ON CONFLICT (id) DO UPDATE SET
        ${sql(data, ...columns.filter(c => c !== 'id'))}
    `;
  } else {
    // If it's an existing record, update it.
    if (tableName === 'lists') {
      data.modified = new Date();
    }
    
    // `data` contains all properties for the update, including `deleted` for soft-deletes.
    const { id: _id, ...updateData } = data;
    const columnsToUpdate = Object.keys(updateData);
    
    if (columnsToUpdate.length > 0) {
      await sql`
        UPDATE ${sql(tableName)}
        SET ${sql(updateData, ...columnsToUpdate)}
        WHERE id = ${id}::uuid
      `
    }
  }
}
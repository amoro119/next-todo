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
    modified_columns: modified_columns_raw,
    new: isNew,
    deleted,
  } = change
  const modified_columns = modified_columns_raw as (keyof typeof change)[]

  if (deleted) {
    await sql`
      DELETE FROM ${sql(tableName)} WHERE id = ${id}
    `
  } else if (isNew) {
    await sql`
      INSERT INTO ${sql(tableName)} ${sql(change, 'id', ...modified_columns)}
    `
  } else {
    // We remove modified_columns from the change object so it doesn't try to update it.
    // The server-side table doesn't have this column.
    const { modified_columns: _mc, new: _n, deleted: _d, ...updateData } = change
    
    await sql`
      UPDATE ${sql(tableName)} 
      SET ${sql(updateData, ...modified_columns)}
      WHERE id = ${id}
    `
  }
}
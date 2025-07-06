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

  const modified_columns = (modified_columns_raw as (keyof typeof change)[]) || [];

  if (deleted) {
    await sql`
      DELETE FROM ${sql(tableName)} WHERE id = ${id}::uuid
    `
  } else if (isNew) {
    // Remove local-only fields before insert
    const { new: _n, deleted: _d, modified_columns: _mc, synced: _s, backup: _b, ...insertData } = change as any;
    const columnsToInsert = Object.keys(insertData);
    
    // Use ON CONFLICT to handle duplicate keys
    await sql`
      INSERT INTO ${sql(tableName)} ${sql(insertData, ...columnsToInsert)}
      ON CONFLICT (id) DO UPDATE SET
        ${sql(insertData, ...columnsToInsert.filter(col => col !== 'id'))}
    `
  } else {
    // Remove fields that shouldn't be updated
    const { id: _id, new: _n, deleted: _d, modified_columns: _mc, synced: _s, backup: _b, ...updateData } = change as any;
    
    if (modified_columns.length > 0) {
      // Add modified timestamp for lists table
      if (tableName === 'lists') {
        updateData.modified = new Date();
      }
      
      const columnsToUpdate = modified_columns.filter(col => col in updateData);
      
      // For lists table, always include modified timestamp
      if (tableName === 'lists' && !columnsToUpdate.includes('modified')) {
        columnsToUpdate.push('modified');
      }

      if (columnsToUpdate.length > 0) {
        await sql`
          UPDATE ${sql(tableName)} 
          SET ${sql(updateData, ...columnsToUpdate)}
          WHERE id = ${id}::uuid
        `
      }
    }
  }
}
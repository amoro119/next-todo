// app/sync.ts
import { Mutex } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { PGliteWithSync } from '@electric-sql/pglite-sync'
import type { ListChange, TodoChange, ChangeSet } from '../lib/changes'
import { postInitialSync } from '../db/migrations-client'
import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'

const WRITE_SERVER_URL = process.env.NEXT_PUBLIC_WRITE_SERVER_URL || `http://localhost:3001`
const ELECTRIC_URL = process.env.NEXT_PUBLIC_ELECTRIC_URL || `http://localhost:5133`
const APPLY_CHANGES_URL = `${WRITE_SERVER_URL}/apply-changes`

type SyncStatus = 'initial-sync' | 'done' | 'error'

type PGliteWithExtensions = PGliteWithLive & PGliteWithSync

export async function startSync(pg: PGliteWithExtensions) {
  try {
    await startSyncToDatabase(pg)
    startWritePath(pg)
  } catch (error) {
    console.error('Sync failed to start:', error)
    updateSyncStatus('error', 'Sync failed to initialize.')
  }
}

async function startSyncToDatabase(pg: PGliteWithExtensions) {
  const todos = await pg.query(`SELECT 1 FROM todos LIMIT 1`)
  const hasTodosAtStart = todos.rows.length > 0

  let initialSyncDone = false
  const shapes = ['lists', 'todos', 'meta']
  const initialSyncPromises: Promise<void>[] = []
  let syncedShapes = 0

  if (!hasTodosAtStart) {
    updateSyncStatus('initial-sync', 'Downloading data shapes...')
  }

  shapes.forEach(shapeName => {
    let shapeInitialSyncDone = false
    
    const shapeSyncPromise = new Promise<void>(async (resolve, reject) => {
      try {
        await pg.sync.syncShapeToTable({
          shape: {
            url: new URL(`${ELECTRIC_URL}/v1/shape`).toString(),
            params: { table: shapeName },
          },
          table: shapeName,
          // 'meta' 表的主键是 'key'，其他是 'id'
          primaryKey: shapeName === 'meta' ? ['key'] : ['id'],
          shapeKey: shapeName,
          commitGranularity: 'up-to-date',
          useCopy: true,
          onInitialSync: async () => {
            if (!shapeInitialSyncDone) {
              shapeInitialSyncDone = true;
              syncedShapes++;
              // 'meta' 表没有触发器，所以跳过
              if (shapeName !== 'meta') {
                await pg.exec(`ALTER TABLE ${shapeName} ENABLE TRIGGER ALL`);
              }
              updateSyncStatus('initial-sync', `Synced ${syncedShapes}/${shapes.length} data shapes...`);
              if (syncedShapes === shapes.length) {
                if (!hasTodosAtStart && !initialSyncDone) {
                  initialSyncDone = true
                  updateSyncStatus('initial-sync', 'Creating indexes...')
                  await postInitialSync(pg)
                }
              }
            }
          },
        });
        // 如果 syncShapeToTable 成功完成，则解决 Promise
        resolve();
      } catch (error) {
        // 如果出错，则拒绝 Promise
        console.error(`${shapeName} sync error`, error);
        reject(error);
      }
    });

    initialSyncPromises.push(shapeSyncPromise);
  });

  if (!hasTodosAtStart) {
    await Promise.all(initialSyncPromises);
    await pg.query(`SELECT 1;`) // 确保 PGlite 空闲
  }
  updateSyncStatus('done')
}


const syncMutex = new Mutex()

async function startWritePath(pg: PGliteWithExtensions) {
  pg.live.query<{
    list_count: number
    todo_count: number
  }>(
    `
      SELECT * FROM
        (SELECT count(id) as list_count FROM lists WHERE synced = false),
        (SELECT count(id) as todo_count FROM todos WHERE synced = false)
    `,
    [],
    async (results) => {
      const { list_count, todo_count } = results.rows[0]
      if (list_count > 0 || todo_count > 0) {
        await syncMutex.acquire()
        try {
          await doSyncToServer(pg)
        } finally {
          syncMutex.release()
        }
      }
    }
  )
}

async function doSyncToServer(pg: PGliteWithExtensions) {
  let listChanges: ListChange[] = [];
  let todoChanges: TodoChange[] = [];
  
  await pg.transaction(async (tx) => {
    const listRes = await tx.query<ListChange>(`
      SELECT id, name, sort_order, is_hidden, modified_columns, deleted, new FROM lists
      WHERE synced = false AND sent_to_server = false
    `);
    const todoRes = await tx.query<TodoChange>(`
      SELECT id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id, modified_columns, new FROM todos
      WHERE synced = false AND sent_to_server = false
    `);
    listChanges = listRes.rows;
    todoChanges = todoRes.rows;
  });

  const changeSet: ChangeSet = {
    lists: listChanges,
    todos: todoChanges,
  };

  if (changeSet.lists.length === 0 && changeSet.todos.length === 0) {
    return;
  }

  const response = await fetch(APPLY_CHANGES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changeSet),
  });

  if (!response.ok) {
    throw new Error('Failed to apply changes to server');
  }

  await pg.transaction(async (tx) => {
    tx.exec('SET LOCAL electric.bypass_triggers = true');
    
    for (const list of listChanges) {
      await tx.query(`UPDATE lists SET sent_to_server = true WHERE id = $1`, [list.id]);
    }
    for (const todo of todoChanges) {
      await tx.query(`UPDATE todos SET sent_to_server = true WHERE id = $1`, [todo.id]);
    }
  });
}


export function updateSyncStatus(newStatus: SyncStatus, message?: string) {
  // Guard against SSR
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem('syncStatus', JSON.stringify([newStatus, message]))
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'syncStatus',
      newValue: JSON.stringify([newStatus, message]),
    })
  )
}

export function useSyncStatus(): [SyncStatus, string | undefined] {
  const [syncStatus, setSyncStatus] = useState<[SyncStatus, string | undefined]>(['initial-sync', 'Starting sync...']);

  useEffect(() => {
    const getStatus = (): [SyncStatus, string | undefined] => {
      // This will only run on the client, where localStorage is available.
      const currentSyncStatusJson = localStorage.getItem('syncStatus');
      return currentSyncStatusJson ? JSON.parse(currentSyncStatusJson) : ['initial-sync', 'Starting sync...'];
    };
    
    setSyncStatus(getStatus());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'syncStatus' && e.newValue) {
        setSyncStatus(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return syncStatus;
}


let initialSyncDone = false;
export function waitForInitialSyncDone() {
  return new Promise<void>((resolve) => {
    if (initialSyncDone) {
      resolve();
      return;
    }
    // Guard against SSR
    if (typeof window === 'undefined') {
      return;
    }
    const checkStatus = () => {
        const currentSyncStatusJson = localStorage.getItem('syncStatus');
        const [currentStatus] = currentSyncStatusJson ? JSON.parse(currentSyncStatusJson) : ['initial-sync'];
        if (currentStatus === 'done') {
            initialSyncDone = true;
            resolve();
            return true;
        }
        return false;
    };
    if (checkStatus()) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'syncStatus' && e.newValue) {
        if (checkStatus()) {
          window.removeEventListener('storage', handleStorageChange)
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
  });
}
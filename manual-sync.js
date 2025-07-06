import { PGlite } from '@electric-sql/pglite';

async function manualSync() {
  const pg = new PGlite('file:local.db');
  
  try {
    console.log('开始手动同步...');
    
    // 同步 lists 数据
    console.log('同步 lists 数据...');
    const listsResponse = await fetch('http://localhost:5133/v1/shape?columns=id%2Cname%2Csort_order%2Cis_hidden%2Cmodified&offset=-1&table=lists');
    const listsData = await listsResponse.json();
    
    for (const item of listsData) {
      if (item.value && item.headers.operation === 'insert') {
        const { id, name, sort_order, is_hidden, modified } = item.value;
        const sortOrder = parseInt(sort_order);
        const isHidden = is_hidden === 'true';
        
        await pg.exec(`
          INSERT INTO lists (id, name, sort_order, is_hidden, modified) 
          VALUES ('${id}', '${name}', ${sortOrder}, ${isHidden}, '${modified}')
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order,
            is_hidden = EXCLUDED.is_hidden,
            modified = EXCLUDED.modified
        `);
        console.log(`插入/更新 lists: ${name}`);
      }
    }
    
    // 同步 todos 数据
    console.log('同步 todos 数据...');
    const todosResponse = await fetch('http://localhost:5133/v1/shape?columns=id%2Ctitle%2Ccompleted%2Cdeleted%2Csort_order%2Cdue_date%2Ccontent%2Ctags%2Cpriority%2Ccreated_time%2Ccompleted_time%2Cstart_date%2Clist_id&offset=-1&table=todos');
    const todosData = await todosResponse.json();
    
    for (const item of todosData) {
      if (item.value && item.headers.operation === 'insert') {
        const { id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id } = item.value;
        const sortOrder = parseInt(sort_order);
        const priorityNum = parseInt(priority);
        const isCompleted = completed === 'true';
        const isDeleted = deleted === 'true';
        const listIdValue = list_id || 'NULL';
        const completedTimeValue = completed_time || 'NULL';
        
        await pg.exec(`
          INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id) 
          VALUES ('${id}', '${title}', ${isCompleted}, ${isDeleted}, ${sortOrder}, '${due_date}', '${content}', '${tags}', ${priorityNum}, '${created_time}', ${completedTimeValue}, '${start_date}', ${listIdValue})
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            completed = EXCLUDED.completed,
            deleted = EXCLUDED.deleted,
            sort_order = EXCLUDED.sort_order,
            due_date = EXCLUDED.due_date,
            content = EXCLUDED.content,
            tags = EXCLUDED.tags,
            priority = EXCLUDED.priority,
            created_time = EXCLUDED.created_time,
            completed_time = EXCLUDED.completed_time,
            start_date = EXCLUDED.start_date,
            list_id = EXCLUDED.list_id
        `);
        console.log(`插入/更新 todos: ${title}`);
      }
    }
    
    console.log('手动同步完成！');
    
    // 显示同步后的数据
    console.log('\n=== 同步后的数据 ===');
    const lists = await pg.query('SELECT id, name, sort_order, is_hidden, modified FROM lists ORDER BY sort_order, name;');
    console.log('Lists:', JSON.stringify(lists.rows, null, 2));
    
    const todos = await pg.query('SELECT id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id FROM todos ORDER BY sort_order, created_time DESC;');
    console.log('Todos:', JSON.stringify(todos.rows, null, 2));
    
  } catch (error) {
    console.error('同步失败:', error);
  } finally {
    await pg.close();
  }
}

manualSync(); 
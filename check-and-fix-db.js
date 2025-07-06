// check-and-fix-db.js
const { PGlite } = require('@electric-sql/pglite')

async function checkAndFixDB() {
  try {
    console.log('检查并修复本地数据库表结构...')
    
    // 创建PGlite实例
    const pg = new PGlite('file:local.db')
    
    // 检查lists表结构
    console.log('\n=== 检查 lists 表结构 ===')
    const listsColumns = await pg.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'lists' 
      ORDER BY ordinal_position;
    `)
    
    console.log('Lists表当前字段:')
    console.log(listsColumns.rows.map(row => row.column_name))
    
    // 检查todos表结构
    console.log('\n=== 检查 todos 表结构 ===')
    const todosColumns = await pg.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'todos' 
      ORDER BY ordinal_position;
    `)
    
    console.log('Todos表当前字段:')
    console.log(todosColumns.rows.map(row => row.column_name))
    
    // 修复lists表 - 确保有modified字段
    const listsHasModified = listsColumns.rows.some(row => row.column_name === 'modified')
    if (!listsHasModified) {
      console.log('\nLists表缺少modified字段，正在添加...')
      await pg.exec(`
        ALTER TABLE lists ADD COLUMN modified TIMESTAMPTZ DEFAULT NOW();
      `)
      console.log('Lists表modified字段添加成功')
    } else {
      console.log('\nLists表已有modified字段')
    }
    
    // 修复todos表 - 确保有modified字段
    const todosHasModified = todosColumns.rows.some(row => row.column_name === 'modified')
    if (!todosHasModified) {
      console.log('\nTodos表缺少modified字段，正在添加...')
      await pg.exec(`
        ALTER TABLE todos ADD COLUMN modified TIMESTAMPTZ DEFAULT NOW();
      `)
      console.log('Todos表modified字段添加成功')
    } else {
      console.log('\nTodos表已有modified字段')
    }
    
    // 验证修复结果
    console.log('\n=== 修复后的表结构 ===')
    const finalListsColumns = await pg.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'lists' ORDER BY ordinal_position;
    `)
    console.log('Lists表字段:', finalListsColumns.rows.map(row => row.column_name))
    
    const finalTodosColumns = await pg.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'todos' ORDER BY ordinal_position;
    `)
    console.log('Todos表字段:', finalTodosColumns.rows.map(row => row.column_name))
    
    await pg.close()
    console.log('\n✅ 本地数据库表结构检查和修复完成！')
    
  } catch (error) {
    console.error('检查和修复失败:', error)
  }
}

checkAndFixDB() 
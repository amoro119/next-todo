// check-and-fix-db.js
import { PGlite } from '@electric-sql/pglite'

async function checkAndFixDB() {
  try {
    console.log('检查并修复本地数据库表结构...')
    
    // 创建PGlite实例
    const pg = new PGlite('pgdata')
    
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
    
    // 检查meta表结构
    console.log('\n=== 检查 meta 表结构 ===')
    const metaColumns = await pg.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'meta' 
      ORDER BY ordinal_position;
    `)
    
    console.log('Meta表当前字段:')
    console.log(metaColumns.rows.map(row => row.column_name))
    
    // 检查各表的行数
    console.log('\n=== 检查各表行数 ===')
    
    // 检查lists表行数
    const listsCount = await pg.query('SELECT COUNT(*) as count FROM lists')
    console.log(`📊 Lists表行数: ${listsCount.rows[0].count}`)
    
    // 检查todos表行数
    const todosCount = await pg.query('SELECT COUNT(*) as count FROM todos')
    console.log(`📊 Todos表行数: ${todosCount.rows[0].count}`)
    
    // 检查meta表行数
    const metaCount = await pg.query('SELECT COUNT(*) as count FROM meta')
    console.log(`📊 Meta表行数: ${metaCount.rows[0].count}`)
    
    // 显示todos表的完成状态统计
    const todosCompletedCount = await pg.query('SELECT COUNT(*) as count FROM todos WHERE completed = true')
    const todosPendingCount = await pg.query('SELECT COUNT(*) as count FROM todos WHERE completed = false')
    const todosDeletedCount = await pg.query('SELECT COUNT(*) as count FROM todos WHERE deleted = true')
    
    console.log('\n=== Todos表状态统计 ===')
    console.log(`✅ 已完成: ${todosCompletedCount.rows[0].count}`)
    console.log(`⏳ 待完成: ${todosPendingCount.rows[0].count}`)
    console.log(`🗑️  已删除: ${todosDeletedCount.rows[0].count}`)
    
    // 显示lists表的隐藏状态统计
    const listsHiddenCount = await pg.query('SELECT COUNT(*) as count FROM lists WHERE is_hidden = true')
    const listsVisibleCount = await pg.query('SELECT COUNT(*) as count FROM lists WHERE is_hidden = false')
    
    console.log('\n=== Lists表状态统计 ===')
    console.log(`👁️  可见列表: ${listsVisibleCount.rows[0].count}`)
    console.log(`🙈 隐藏列表: ${listsHiddenCount.rows[0].count}`)
    
    // 显示meta表的内容
    console.log('\n=== Meta表内容 ===')
    const metaData = await pg.query('SELECT key, value FROM meta ORDER BY key')
    metaData.rows.forEach(row => {
      console.log(`  ${row.key}: ${row.value}`)
    })
    
    await pg.close()
    console.log('\n✅ 本地数据库表结构检查和统计完成！')
    
  } catch (error) {
    console.error('检查和修复失败:', error)
  }
}

checkAndFixDB() 
const { PGlite } = require('@electric-sql/pglite')

async function fixLocalDB() {
  try {
    console.log('修复本地数据库表结构...')
    
    // 创建PGlite实例
    const pg = new PGlite('file:local.db')
    
    // 检查lists表是否有modified字段
    const hasModified = await pg.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'lists' AND column_name = 'modified';
    `)
    
    if (hasModified.rows.length === 0) {
      console.log('Lists表缺少modified字段，正在添加...')
      await pg.exec(`
        ALTER TABLE lists ADD COLUMN modified TIMESTAMPTZ DEFAULT NOW();
      `)
      console.log('modified字段添加成功')
    } else {
      console.log('Lists表已有modified字段')
    }
    
    // 检查todos表是否有modified字段
    const todosHasModified = await pg.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'todos' AND column_name = 'modified';
    `)
    
    if (todosHasModified.rows.length === 0) {
      console.log('Todos表缺少modified字段，正在添加...')
      await pg.exec(`
        ALTER TABLE todos ADD COLUMN modified TIMESTAMPTZ DEFAULT NOW();
      `)
      console.log('todos modified字段添加成功')
    } else {
      console.log('Todos表已有modified字段')
    }
    
    // 验证修复结果
    const listsStructure = await pg.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'lists' 
      ORDER BY ordinal_position;
    `)
    
    console.log('\n修复后的Lists表结构:')
    console.log(listsStructure.rows.map(row => row.column_name))
    
    await pg.close()
    console.log('✅ 本地数据库表结构修复完成！')
    
  } catch (error) {
    console.error('修复失败:', error)
  }
}

fixLocalDB() 
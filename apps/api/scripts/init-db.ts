import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const d1Dir = join(import.meta.dirname, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

async function main() {
  try {
    const dbFile = (await readdir(d1Dir)).find(
      (file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite',
    );

    if (!dbFile) {
      console.error('❌ 找不到本地 D1 SQLite 数据库文件。');
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    console.log(`⚡ 正在直接应用 schema 到数据库: ${dbPath}`);

    const db = new Database(dbPath);
    const sql = readFileSync(join(import.meta.dirname, '../migrations/0001_init.sql'), 'utf8');

    // 执行完整的 0001_init.sql 初始化
    db.exec(sql);

    console.log('✅ 数据库 Schema 应用成功！');
  } catch (err: any) {
    console.error('❌ 执行 SQL 初始化出错:', err.message);
    process.exit(1);
  }
}

main();

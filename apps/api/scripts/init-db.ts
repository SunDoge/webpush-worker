import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const d1Dir = join(import.meta.dir, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

async function main() {
  try {
    const glob = new Glob('*.sqlite');
    let dbFile: string | undefined;

    for await (const file of glob.scan(d1Dir)) {
      if (file !== 'metadata.sqlite') {
        dbFile = file;
        break;
      }
    }

    if (!dbFile) {
      console.error('❌ 找不到本地 D1 SQLite 数据库文件。');
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    console.log(`⚡ 正在直接应用 schema 到数据库: ${dbPath}`);

    const db = new Database(dbPath);
    const sql = readFileSync(join(import.meta.dir, '../migrations/0001_init.sql'), 'utf8');

    // 执行完整的 0001_init.sql 初始化
    db.exec(sql);

    console.log('✅ 数据库 Schema 应用成功！');
  } catch (err: any) {
    console.error('❌ 执行 SQL 初始化出错:', err.message);
    process.exit(1);
  }
}

main();

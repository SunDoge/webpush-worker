import Database from 'better-sqlite3';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const d1Dir = join(import.meta.dirname, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

async function main() {
  try {
    const dbFile = (await readdir(d1Dir)).find(
      (file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite',
    );

    if (!dbFile) {
      console.error('❌ 找不到数据库文件。');
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    const db = new Database(dbPath);

    const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
    console.log('=== USERS ===');
    console.log(users);

    const codes = db.prepare('SELECT * FROM invitation_codes').all();
    console.log('=== INVITATION CODES ===');
    console.log(codes);
  } catch (err: any) {
    console.error('❌ 查询数据库出错:', err.message);
  }
}

main();

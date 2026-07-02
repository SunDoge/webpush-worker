import { Database } from 'bun:sqlite';
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
      console.error('❌ 找不到数据库文件。');
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    const db = new Database(dbPath);

    const users = db.query('SELECT id, username, role, created_at FROM users').all();
    console.log('=== USERS ===');
    console.log(users);

    const codes = db.query('SELECT * FROM invitation_codes').all();
    console.log('=== INVITATION CODES ===');
    console.log(codes);
  } catch (err: any) {
    console.error('❌ 查询数据库出错:', err.message);
  }
}

main();

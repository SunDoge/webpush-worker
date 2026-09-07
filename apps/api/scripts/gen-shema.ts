import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const scriptsDir = import.meta.dirname;

async function main() {
  const d1Dir = join(scriptsDir, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

  try {
    const dbFile = (await readdir(d1Dir)).find(
      (file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite',
    );

    if (!dbFile) {
      console.error(
        '❌ 找不到本地 D1 SQLite 数据库文件。请确保您已经运行过本地服务或执行过 migrations。',
      );
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    console.log(`🔍 找到本地 D1 SQLite 路径: ${dbPath}`);

    const outPath = join(scriptsDir, '../src/db/schema.d.ts');
    console.log(`⚡ 正在调用 kysely-codegen 生成 Schema 到 -> ${outPath}`);

    execFileSync(
      'pnpm',
      ['exec', 'kysely-codegen', '--dialect', 'sqlite', '--url', dbPath, '--out-file', outPath],
      { stdio: 'inherit' },
    );

    console.log('✅ Kysely Schema 生成成功！');
  } catch (err: any) {
    console.error('❌ 生成 Schema 出错:', err.message);
    process.exit(1);
  }
}

main();

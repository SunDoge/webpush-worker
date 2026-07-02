import { join } from 'node:path';
import { $, Glob } from 'bun';

async function main() {
  const d1Dir = join(import.meta.dir, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

  try {
    // 使用 Bun 原生的 Glob 查找 .sqlite 文件
    const glob = new Glob('*.sqlite');
    let dbFile: string | undefined;

    for await (const file of glob.scan(d1Dir)) {
      if (file !== 'metadata.sqlite') {
        dbFile = file;
        break;
      }
    }

    if (!dbFile) {
      console.error(
        '❌ 找不到本地 D1 SQLite 数据库文件。请确保您已经运行过本地服务或执行过 migrations。',
      );
      process.exit(1);
    }

    const dbPath = join(d1Dir, dbFile);
    console.log(`🔍 [Bun Glob] 找到本地 D1 SQLite 路径: ${dbPath}`);

    const outPath = join(import.meta.dir, '../src/db/schema.d.ts');
    console.log(`⚡ 正在调用 kysely-codegen 生成 Schema 到 -> ${outPath}`);

    // 使用 Bun Shell 命令行执行
    await $`bunx kysely-codegen --dialect sqlite --url ${dbPath} --out-file ${outPath}`;

    console.log('✅ Kysely Schema 生成成功！');
  } catch (err: any) {
    console.error('❌ 生成 Schema 出错:', err.message);
    process.exit(1);
  }
}

main();

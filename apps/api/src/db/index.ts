import { D1Dialect } from '@sundoge/kysely-d1';
import { Kysely } from 'kysely';
import type { DB } from './schema';

/**
 * 获取 Kysely 数据库实例的封装函数
 * 由于 D1 是无连接的，实例化 Kysely 极其轻量，
 * 每次请求直接创建新实例可以确保绑定的 D1 实例始终最新，避免热启动时的引用失效问题。
 */
export function getDb(d1: D1Database): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new D1Dialect({
      database: d1,
    }),
  });
}

// 重新导出 Schema 中所有的数据库类型定义
export type * from './schema';

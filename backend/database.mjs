import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';

pg.types.setTypeParser(20, value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw Error('Número fuera del límite permitido.');
  return n;
});

// Only the application's SQL is translated; values always remain parameters.
export function postgresSql(sql) {
  let ignore = /^\s*INSERT OR IGNORE INTO/i.test(sql);
  sql = sql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/([\w.]+)\s*=\s*\?\s+COLLATE NOCASE/gi, 'lower($1)=lower(?)')
    .replace(/\browid\b/g, 'orden');
  let index = 0;
  sql = sql.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? '$' + (++index) : token);
  if (ignore) sql += ' ON CONFLICT DO NOTHING';
  return sql;
}

export async function openDatabase(input) {
  const url = typeof input === 'object' ? input.url : !input ? process.env.DATABASE_URL : null;
  const context = new AsyncLocalStorage();
  if (url) {
    const schema = input?.schema;
    if (schema && !/^soha_test_[a-z0-9_]+$/.test(schema)) throw Error('Esquema de prueba inválido.');
    const pool = new pg.Pool({ connectionString: url, max: 10,
      ...(schema ? {options: `-c search_path=${schema}`} : {}) });
    pool.on('error', () => console.error('PostgreSQL: conexión interrumpida.'));
    const query = (sql, params = []) => (context.getStore() || pool).query(postgresSql(sql), params);
    const db = {
      dialect: 'postgresql',
      all: async (sql, ...params) => (await query(sql, params)).rows,
      one: async (sql, ...params) => (await query(sql, params)).rows[0],
      run: async (sql, ...params) => ({changes: (await query(sql, params)).rowCount}),
      exec: async sql => { await query(sql); },
      columns: async table => (await query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?', [table])).rows,
      transaction: async fn => {
        if (context.getStore()) return fn();
        for (let attempt = 0; ; attempt++) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
            const result = await context.run(client, fn);
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK');
            if (!['40001','40P01'].includes(error.code) || attempt >= 3) throw error;
          } finally { client.release(); }
        }
      },
      close: () => pool.end(),
    };
    await db.one('SELECT 1 AS ok');
    return db;
  }
  if (!input) throw Error('Falta configurar la base de datos.');
  if (input !== ':memory:') mkdirSync(dirname(input), {recursive: true});
  const sqlite = new DatabaseSync(input);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  let tail = Promise.resolve();
  const locked = async fn => {
    if (context.getStore()) return fn();
    const previous = tail;
    let release;
    tail = new Promise(resolve => {release = resolve;});
    await previous;
    try { return await context.run(true, fn); } finally {release();}
  };
  return {
    dialect: 'sqlite',
    all: (sql, ...params) => locked(() => sqlite.prepare(sql).all(...params)),
    one: (sql, ...params) => locked(() => sqlite.prepare(sql).get(...params)),
    run: (sql, ...params) => locked(() => sqlite.prepare(sql).run(...params)),
    exec: sql => locked(() => sqlite.exec(sql)),
    columns: table => locked(() => sqlite.prepare(`PRAGMA table_info(${table})`).all()),
    transaction: fn => locked(async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {const result = await fn(); sqlite.exec('COMMIT'); return result;}
      catch(error) {sqlite.exec('ROLLBACK'); throw error;}
    }),
    close: () => locked(() => sqlite.close()),
  };
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const serialize = (value) => typeof value === 'object' ? JSON.stringify(value) : String(value);
const decode = (value) => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return value; } };
export async function command(...args) {
  const { stdout } = await exec(process.env.REDIS_CLI_BINARY || 'redis-cli', ['-p', process.env.REDIS_TEST_PORT || '16379', '--json', ...args.map(serialize)], { maxBuffer: 4000000 });
  if (stdout.startsWith('error:')) throw new Error(stdout);
  return JSON.parse(stdout);
}
export const redis = {
  get: async (key) => decode(await command('GET', key)),
  set: (key, value, options = {}) => command('SET', key, serialize(value), ...(options.nx ? ['NX'] : []), ...(options.ex ? ['EX', options.ex] : [])),
  eval: (script, keys, args) => command('EVAL', script, keys.length, ...keys, ...args),
  incr: (key) => command('INCR', key), del: (...keys) => command('DEL', ...keys),
  sadd: (key, ...values) => command('SADD', key, ...values), smembers: (key) => command('SMEMBERS', key),
  // List/hash reads decode JSON values like @vercel/kv's automatic deserialization.
  mget: async (...keys) => (await command('MGET', ...keys)).map(decode),
  zadd: (key, { score, member }) => command('ZADD', key, score, member),
  persist: (key) => command('PERSIST', key),
  scan: (cursor, { match = '*', count = 10 } = {}) => command('SCAN', cursor, 'MATCH', match, 'COUNT', count),
  rpush: (key, ...values) => command('RPUSH', key, ...values), llen: (key) => command('LLEN', key),
  lindex: async (key, index) => decode(await command('LINDEX', key, index)),
  lrange: async (key, start, end) => (await command('LRANGE', key, start, end)).map(decode),
  hgetall: async (key) => {
    const flat = await command('HGETALL', key);
    const pairs = Array.isArray(flat) ? flat.reduce((all, value, i) => (i % 2 ? all : [...all, [value, flat[i + 1]]]), []) : Object.entries(flat || {});
    return pairs.length ? Object.fromEntries(pairs.map(([k, v]) => [k, decode(v)])) : null;
  },
  zrange: (key, start, end, options = {}) => command('ZRANGE', key, start, end, ...(options.byScore ? ['BYSCORE'] : []), ...(options.rev ? ['REV'] : []), ...(options.count ? ['LIMIT', options.offset || 0, options.count] : [])),
};

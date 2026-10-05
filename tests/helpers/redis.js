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
  zrange: (key, start, end, options = {}) => command('ZRANGE', key, start, end, ...(options.byScore ? ['BYSCORE'] : []), ...(options.rev ? ['REV'] : []), ...(options.count ? ['LIMIT', options.offset || 0, options.count] : [])),
};

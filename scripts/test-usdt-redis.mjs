// Disposable real Redis. Never uses production KV or flushes a shared database.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const dir = await mkdtemp(join(tmpdir(), 'datastore-usdt-test-'));
const server = spawn(process.env.REDIS_SERVER_BINARY || 'redis-server', ['--bind','127.0.0.1','--port',String(port),'--dir',dir,'--save','','--appendonly','yes'], { stdio: ['ignore','pipe','pipe'] });
const exited = new Promise((resolve) => { server.once('exit', resolve); server.once('error', resolve); });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Redis startup timeout')), 10000);
    server.on('error', (error) => { clearTimeout(timeout); reject(error); });
    server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Redis exited: ${code}`)); });
    server.stdout.on('data', (data) => { if (data.toString().includes('Ready to accept connections')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', (data) => process.stderr.write(data));
  });
  const test = spawn(process.execPath, ['node_modules/vitest/vitest.mjs','run','tests/usdt.redis.test.js'], { stdio: 'inherit', env: { ...process.env, REDIS_TEST_PORT: String(port) } });
  process.exitCode = await new Promise((resolve) => test.on('exit', resolve));
} finally { server.kill(); await exited; await rm(dir, { recursive: true, force: true }); }

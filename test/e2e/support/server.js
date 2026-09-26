const { spawnSync, spawn } = require('node:child_process');
const { env } = require('./environment');
for (const args of [['db:prepare'], ['tailwindcss:build'], ['runner', 'test/e2e/support/fixtures.rb', 'reset']]) {
  const result = spawnSync('bin/rails', args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const server = spawn('bundle', ['exec', 'puma', '-b', 'tcp://127.0.0.1:3118', 'test/e2e/support/app.ru'], { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', code => process.exit(code || 0));

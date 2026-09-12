/**
 * pm2 for the two long-running processes. Postgres and Redis stay in Docker
 * (`pnpm infra:up`) — pm2 manages node processes, not containers.
 *
 * The interpreter is pinned: the pm2 daemon on this machine runs Node 25 and other
 * projects rely on that, but this one is Node 24 (.nvmrc, D-028). Without the pin, pm2
 * launches the API on whatever the daemon happens to be, which is not what CI or Docker
 * runs.
 *
 * Both apps run the compiled output, so `pnpm build` first. pm2 does not build.
 *
 *   pnpm build && pm2 start ecosystem.config.cjs
 *   pm2 logs jas-api          pm2 restart jas-api          pm2 delete jas-api
 */
const { join } = require('node:path');

const NODE_24 = join(process.env.HOME, '.nvm/versions/node/v24.19.0/bin/node');

const shared = {
  cwd: __dirname,
  interpreter: NODE_24,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  // A boot that fails on bad config should stop, not spin: the logs are unreadable
  // otherwise and the real error scrolls away.
  max_restarts: 5,
  min_uptime: '10s',
  restart_delay: 2000,
  time: true,
  merge_logs: true,
  env: { NODE_ENV: 'development' },
};

module.exports = {
  apps: [
    { ...shared, name: 'jas-api', script: 'dist/main.api.js' },
    { ...shared, name: 'jas-worker', script: 'dist/main.worker.js' },
  ],
};

/**
 * CommonJS giriş — start-all.js ile aynı mantık.
 * Kullanım: node start-all.cjs
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;

function run(label, cmd, args, cwd, logFile) {
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');
  console.log(`[start] ${label}: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', out, err],
    shell: true,
    env: {
      ...process.env,
      NODE_PORT: process.env.NODE_PORT || '4000',
      GO_PORT: process.env.GO_PORT || '8080',
      FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    },
  });
  proc.on('close', (code) => {
    if (code !== 0) fs.appendFileSync(logFile, `${label} exited with code ${code}\n`);
  });
}

run('go', 'go', ['run', 'main.go'], path.join(root, 'backend', 'go'), path.join(root, 'go-backend.log'));
run('node', 'node', ['app.js'], path.join(root, 'backend', 'node'), path.join(root, 'node-backend.log'));
run('frontend', 'npm', ['run', 'dev'], root, path.join(root, 'frontend.log'));

console.log('Tüm servisler başlatıldı. Loglar: go-backend.log, node-backend.log, frontend.log');
console.log('UI: http://localhost:5173 | Node: :4000 | Go: :8080');

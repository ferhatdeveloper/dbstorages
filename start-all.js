/**
 * GraphCore — tüm servisleri başlatır.
 * Portlar: Frontend 5173 | Node 4000 | Go 8080
 * Kullanım: npm run start:all   veya   node start-all.js
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

function run(label, cmd, args, cwd) {
  console.log(`[start] ${label}: ${cmd} ${args.join(' ')} (cwd=${cwd})`);
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_PORT: process.env.NODE_PORT || '4000',
      GO_PORT: process.env.GO_PORT || '8080',
      FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    },
  });
  proc.on('close', (code) => {
    if (code !== 0) console.error(`[${label}] exited with code ${code}`);
  });
  return proc;
}

const goDir = path.join(root, 'backend', 'go');
const nodeDir = path.join(root, 'backend', 'node');

if (!fs.existsSync(path.join(root, 'node_modules'))) {
  console.warn('[uyarı] Kök node_modules yok — önce: npm install');
}
if (!fs.existsSync(path.join(nodeDir, 'node_modules'))) {
  console.warn('[uyarı] backend/node node_modules yok — önce: cd backend/node && npm install');
}

run('go', 'go', ['run', 'main.go'], goDir);
run('node', 'node', ['app.js'], nodeDir);
run('frontend', 'npm', ['run', 'dev'], root);

console.log('Servisler başlatıldı → http://localhost:5173  (API: :4000 / :8080)');

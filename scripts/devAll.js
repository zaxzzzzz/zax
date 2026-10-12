/**
 * Cross-platform dev orchestrator: runs the backend API server and the Vite
 * dev server together (`npm run dev:all`). Spawns both processes directly
 * (no shell), prefixes their log output, and shuts both down when either
 * exits or the user presses Ctrl+C — works on Windows, macOS and Linux.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const serverEntry = path.join(__dirname, '..', 'server', 'index.js');

/**
 * Locate Vite's CLI entry (bin/vite.js). Vite does not export "./bin/vite.js"
 * in its exports map, so resolve via its package.json (which IS exported)
 * and fall back to a direct node_modules path.
 */
function resolveViteEntry() {
  const candidates = [];
  try {
    const pkgPath = require.resolve('vite/package.json');
    candidates.push(path.join(path.dirname(pkgPath), 'bin', 'vite.js'));
  } catch { /* vite not resolvable from here */ }
  candidates.push(path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js'));
  return candidates.find(p => fs.existsSync(p)) || null;
}

const children = [];
let shuttingDown = false;

function run(name, args, opts = {}) {
  const command = opts.file || process.execPath;
  const child = spawn(command, args, {
    env: { ...process.env, FORCE_COLOR: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: opts.shell || false
  });

  const prefix = (line) => {
    if (!line.trim()) return;
    console.log(`[${name}] ${line}`);
  };
  child.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(prefix));
  child.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(prefix));

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`\n[${name}] exited with code ${code} — shutting everything down.`);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('🚀 Starting backend API server + Vite dev server...\n');
run('server', [serverEntry]);

const viteEntry = resolveViteEntry();
if (viteEntry) {
  run('vite', [viteEntry, '--port', '3000']);
} else {
  // Last resort: run the vite CLI through npm exec (needs a shell on Windows)
  console.error('[devAll] vite bin not found — falling back to npx');
  run('vite', [], { file: 'npx', shell: true });
}

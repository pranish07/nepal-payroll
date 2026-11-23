// `npm start` must work on a fresh clone without a separate build step.
// Build the web app only when its build output is missing or older than its sources.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const webRoot = join(process.cwd(), 'apps', 'web');
const indexHtml = join(webRoot, 'dist', 'index.html');

function newestMtime(directory) {
  let newest = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(fullPath));
    } else {
      newest = Math.max(newest, statSync(fullPath).mtimeMs);
    }
  }
  return newest;
}

const needsBuild = !existsSync(indexHtml) || newestMtime(join(webRoot, 'src')) > statSync(indexHtml).mtimeMs;

if (needsBuild) {
  console.log('[start] Building web app...');
  const result = spawnSync('npm', ['run', 'build', '-w', 'apps/web'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log('[start] Using existing web build.');
}

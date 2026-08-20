import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const deployRoot = resolve(projectRoot, '.edgeone-build');
const entries = [
  'css',
  'js',
  'ai.html',
  'history.html',
  'index.html',
  'inherit.html',
  'master.html',
  'package.json',
];

await mkdir(deployRoot, { recursive: true });
for (const entry of entries) {
  await cp(resolve(projectRoot, entry), resolve(deployRoot, entry), {
    recursive: true,
    force: true,
  });
}

console.log('Deployment files synchronized to .edgeone-build.');

import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const deployRoot = resolve(projectRoot, '.edgeone-build');
const entries = [
  'css',
  'js',
  'assets',
  'ai.html',
  'history.html',
  'index.html',
  'inherit.html',
  'master.html',
  'package.json',
];

// 先清空旧产物再同步，确保删除的文件（如精简掉的静态资源）不会残留在部署目录
await rm(deployRoot, { recursive: true, force: true });
await mkdir(deployRoot, { recursive: true });
for (const entry of entries) {
  await cp(resolve(projectRoot, entry), resolve(deployRoot, entry), {
    recursive: true,
    force: true,
  });
}

console.log('Deployment files synchronized to .edgeone-build.');

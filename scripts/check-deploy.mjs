import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '.edgeone-build');
const requiredFiles = [
  'index.html',
  'history.html',
  'inherit.html',
  'ai.html',
  'master.html',
  'css/style.css',
  'js/common.js',
  'functions/api/chat.js',
];
const forbiddenPaths = [
  'references',
  'docs',
  'assets/images/history/optimized/optimized',
];

let failed = false;

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) {
    console.error('Missing deploy file: ' + file);
    failed = true;
  }
}

for (const path of forbiddenPaths) {
  if (existsSync(resolve(root, path))) {
    console.error('Unexpected deploy artifact: ' + path);
    failed = true;
  }
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error('Missing .edgeone-build directory.');
  failed = true;
}

if (!failed) {
  console.log('Deploy package is clean: ' + readdirSync(root).length + ' top-level entries.');
}

process.exitCode = failed ? 1 : 0;

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
const contentChecks = [
  ['inherit.html', 'portrait: false'],
  ['history.html', "'assets/images/history/optimized/'"],
  ['ai.html', "const AI_PROXY_URL = '/api/chat'"],
  ['master.html', 'window.location.replace("inherit.html")'],
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

for (const [file, expectedContent] of contentChecks) {
  const content = await import('node:fs/promises').then(({ readFile }) => readFile(resolve(root, file), 'utf8'));
  if (!content.includes(expectedContent)) {
    console.error('Deploy behavior check failed: ' + file);
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

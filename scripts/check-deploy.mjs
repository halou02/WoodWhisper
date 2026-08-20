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
  'css/ai.css',
  'css/history.css',
  'css/inherit.css',
  'js/common.js',
  'js/ai-config.js',
  'js/inherit-data.js',
  'js/inherit-page.js',
  'js/history-data.js',
  'functions/api/chat.js',
];
const forbiddenPaths = [
  'references',
  'docs',
  'assets/images/history/optimized/optimized',
];
const contentChecks = [
  ['inherit.html', 'js/inherit-data.js'],
  ['inherit.html', 'css/inherit.css'],
  ['inherit.html', 'js/inherit-page.js'],
  ['js/inherit-data.js', 'portrait: false'],
  ['history.html', "'assets/images/history/optimized/'"],
  ['history.html', 'css/history.css'],
  ['history.html', 'js/history-data.js'],
  ['js/history-data.js', 'const DYNASTIES = ['],
  ['ai.html', 'const AI_PROXY_URL = window.WOODWHISPER_AI_PROXY_URL'],
  ['js/ai-config.js', 'WOODWHISPER_AI_PROXY_URL'],
  ['ai.html', 'css/ai.css'],
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

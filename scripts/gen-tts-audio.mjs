#!/usr/bin/env node
/**
 * gen-tts-audio.mjs —— 全站固定文案静态音频生成管线（默认 Edge-tts / 晓晓·温柔女声；
 * --provider local 时走 sherpa-onnx · Matcha-zh 纯 CPU 离线合成）
 *
 * 职责（对应 spec Task 1.2~1.4 / Task 7.2）：
 *   1. 读取 assets/text/tts-sources.json（唯一内容源，全站朗读文案收口文件）；
 *   2. 每个 contentId 的整段文本按中文标点（。！？!?…）拆句，忽略空串；
 *   3. 逐句合成，落盘为 assets/audio/<category>/<contentId>/s<序号>.mp3；
 *      两种 provider 的产物路径与编码完全一致（24kHz 单声道 32kbps mp3）：
 *      - edge（默认）：调用 Microsoft Edge 在线 TTS（voice=zh-CN-XiaoxiaoNeural，
 *        output audio-24khz-32kbitrate-mono-mp3）；
 *      - local：python 常驻 worker（scripts/tts-matcha-worker.py）用 sherpa-onnx
 *        Matcha-zh 模型逐句合成 wav → ffmpeg-static 转 24kHz 单声道 32kbps mp3 → 删 wav。
 *   4. 汇总写 assets/audio/manifest.json：
 *      { version: 1, items: { "<contentId>": { category, sentences, files } } }。
 *
 * 用法：
 *   node scripts/gen-tts-audio.mjs                          # edge 全量
 *   node scripts/gen-tts-audio.mjs --provider local         # Matcha-zh 离线全量
 *   node scripts/gen-tts-audio.mjs --provider local --only inherit/master   # 指定类目（增量续跑）
 *   node scripts/gen-tts-audio.mjs --dry-run                # 离线校验：源项数/类目/断句，不发请求
 *   node scripts/gen-tts-audio.mjs --dry-run --provider local
 *
 * 说明：本脚本只负责"固定文案入库"；生成的 mp3 入库后运行时不再依赖本脚本与任一合成接口。
 * 依赖（devDependencies）：node-edge-tts（edge）；ffmpeg-static（local 转码）。
 * local 运行时：.venv-tts（pip install sherpa-onnx soundfile），模型在 third_party/tts-models/matcha-zh/。
 */
import { EdgeTTS } from 'node-edge-tts';
import WebSocket from 'ws'; // edge 合成用原生 ws（node-edge-tts 不发送 Edge 现要求的 muid Cookie，会 bytes=0）
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_PATH = resolve(ROOT, 'assets/text/tts-sources.json');
const AUDIO_ROOT = resolve(ROOT, 'assets/audio');
const MANIFEST_PATH = resolve(AUDIO_ROOT, 'manifest.json');

// ---- Edge-tts 合成参数 ----
const VOICE = 'zh-CN-XiaoxiaoNeural'; // 晓晓（温柔女声）
const LANG = 'zh-CN';
// Edge 在线 TTS 不提供 24kHz-32kbitrate 组合（会解析失败并空响应）；用原生支持的
// audio-24khz-48kbitrate-mono-mp3，后续如需压缩由 ffmpeg 统一转码（spec「24~32kbps」目标）。
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const RATE = '-10%'; // 全局语速放缓至 ≈0.9（spec REQ-RATE-1）；静态/预设/在线三类语音统一 -10%
const PITCH = 'default';
const VOLUME = 'default';
const TTS_TIMEOUT_MS = 30000; // 单次合成超时（库默认 10s 对长句偏紧）

// ---- 调度参数 ----
const MAX_CONCURRENCY = 2; // 并发数（短文件；保持温和节奏避免触发 Edge 接口限流）
const REQUEST_GAP_MS = 300; // 相邻请求间隔
const MAX_RETRY = 3; // 单句失败重试次数
const RETRY_DELAY_MS = [2000, 5000, 10000]; // 依次递增的重试等待
const GLOBAL_COOLDOWN_MS = 20000; // 单句重试仍失败后，全局冷却再继续下一任务（接口限流缓解）

const SPLIT_RE = /[。！？!?…]/; // 拆句：中文句末标点（含英文 ! ? 与省略号）

const log = (msg) => console.log(msg);

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const args = { dryRun: false, only: null, provider: 'edge', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true; // 覆写已存在文件（用于语速等参数变更后的整库重生成）
    else if (a === '--only') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--only 需要类目参数，例如：--only inherit/master');
      }
      args.only = value;
    } else if (a === '--provider') {
      const value = argv[++i];
      if (value !== 'edge' && value !== 'local') {
        throw new Error('--provider 仅支持 edge|local（当前：' + value + '）');
      }
      args.provider = value;
    } else {
      throw new Error('未知参数：' + a + '\n用法：node scripts/gen-tts-audio.mjs [--dry-run] [--force] [--provider edge|local] [--only <category>]');
    }
  }
  return args;
}

// ---------- 内容源加载与校验 ----------
function loadSources() {
  if (!existsSync(SOURCES_PATH)) {
    throw new Error('缺失内容源文件：' + SOURCES_PATH + '\n请先确保 assets/text/tts-sources.json 存在。');
  }
  let raw;
  try {
    raw = readFileSync(SOURCES_PATH, 'utf8');
  } catch (err) {
    throw new Error('无法读取内容源：' + err.message);
  }
  let sources;
  try {
    sources = JSON.parse(raw);
  } catch (err) {
    throw new Error('内容源 JSON 解析失败（' + SOURCES_PATH + '）：' + err.message);
  }
  if (!Array.isArray(sources.categories) || sources.categories.length === 0) {
    throw new Error('内容源缺少 categories 列表');
  }
  if (!sources.items || typeof sources.items !== 'object') {
    throw new Error('内容源缺少 items 对象');
  }
  const ids = Object.keys(sources.items);
  if (ids.length === 0) throw new Error('内容源 items 为空：没有任何待朗读文案');

  const problems = [];
  for (const id of ids) {
    const item = sources.items[id];
    if (!item || typeof item !== 'object') {
      problems.push(id + '：条目不是对象');
      continue;
    }
    if (!sources.categories.includes(item.category)) {
      problems.push(id + '：类目 "' + item.category + '" 不在 categories 中');
    }
    if (typeof item.text !== 'string' || !item.text.trim()) {
      problems.push(id + '：text 缺失或为空');
    }
  }
  if (problems.length) {
    throw new Error('内容源校验未通过：\n  - ' + problems.join('\n  - '));
  }
  return sources;
}

// ---------- 拆句（与页面运行时共用同一规则）----------
// 按中文句末标点切分并忽略空串；另剔除“无任何可读内容”的纯标点残留
// （正文使用 ASCII 直引号时，引语内部句末标点会在文末留下孤立的 " 片段，无语音内容）。
const SPEAKABLE_RE = /[\p{Script=Han}A-Za-z0-9]/u;

function splitSentences(text) {
  return text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s && SPEAKABLE_RE.test(s));
}

// ---------- 路径工具 ----------
function relAsset(p) {
  return relative(ROOT, p).split(sep).join('/');
}

// ---------- 单句合成（带重试与清理）----------
function fileReady(p) {
  try {
    return existsSync(p) && statSync(p).size > 0;
  } catch {
    return false;
  }
}

// ---- Edge-tts（ws 直连，带 muid Cookie）----
// node-edge-tts 不发送 Edge 现要求的 muid Cookie，会造成 handshake 成功但 bytes=0。
// 这里用 ws 库直连 speech.platform.bing.com，发送 Cookie: muid=<随机>; 取回音频帧。
const EDGE_VERSION = '143.0.3650.75';
const EDGE_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_WINDOWS_EPOCH = 11644473600n;
const EDGE_MIN_BYTES = 200; // 低于该量视为取音频失败（空音频/校验失败）

function edgeGecToken() {
  const ticks = BigInt(Math.floor(Date.now() / 1000 + Number(EDGE_WINDOWS_EPOCH))) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  return createHash('sha256').update(`${rounded}${EDGE_TRUSTED_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}
function edgeMuid() {
  return randomUUID().replaceAll('-', '').toUpperCase();
}
function edgeEscapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}
function edgeRateParam() {
  // RATE 为 "+0%" / "-10%" 等；Edge 接受 "+0%"/"-10%" 形式，pitch/volume 同
  return RATE;
}

async function synthSentenceByWs(sentence, filePath) {
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${EDGE_TRUSTED_TOKEN}` +
    `&Sec-MS-GEC=${edgeGecToken()}` +
    `&Sec-MS-GEC-Version=1-${EDGE_VERSION}`;
  const ws = new WebSocket(wsUrl, {
    origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    headers: {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${EDGE_VERSION.split('.')[0]}.0.0.0`,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': `muid=${edgeMuid()};`,
    },
    perMessageDeflate: false,
  });

  const audioChunks = [];
  let finished = false;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!finished) { finished = true; try { ws.terminate(); } catch {} reject(new Error('Edge 合成超时')); }
    }, TTS_TIMEOUT_MS);

    ws.on('open', () => {
      const config = {
        context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
          outputFormat: OUTPUT_FORMAT,
        } } },
      };
      const configMsg =
        `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`;
      ws.send(configMsg);

      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${LANG}'>` +
        `<voice name='${VOICE}'>` +
        `<prosody pitch='+0Hz' rate='${edgeRateParam()}' volume='+0%'>${edgeEscapeXml(sentence)}</prosody>` +
        `</voice></speak>`;
      const ssmlMsg =
        `X-RequestId:${randomUUID().replaceAll('-', '')}\r\nContent-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const SEP = 'Path:audio\r\n';
        const idx = data.indexOf(SEP);
        if (idx !== -1) audioChunks.push(Buffer.from(data.subarray(idx + SEP.length)));
        else audioChunks.push(data);
      } else {
        const s = data.toString();
        if (s.includes('Path:turn.end')) {
          const total = Buffer.concat(audioChunks).length;
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            if (total < EDGE_MIN_BYTES) {
              reject(new Error(`Edge 返回音频过短（bytes=${total}）`));
            } else {
              writeFileSync(filePath, Buffer.concat(audioChunks));
              resolve(true);
            }
          }
        }
      }
    });

    ws.on('error', (err) => {
      if (!finished) { finished = true; clearTimeout(timeout); reject(new Error('Edge WS 错误：' + (err && err.message ? err.message : err))); }
    });
    ws.on('close', () => {
      clearTimeout(timeout);
      // 未收到 turn.end 即关闭：视为取音频失败（Edge 受限/空响应），必须 reject 触发重试，
      // 否则 Promise 悬着会让 CLI 静默以 0 退出、不写文件也不出报告。
      if (!finished) { finished = true; reject(new Error('Edge 连接提前关闭（未返回音频）')); }
    });
  });
}

function synthSentence(sentence, filePath) {
  // 使用 ws 直连（带 muid Cookie），修复 node-edge-tts 在现代 Edge 接口返回 bytes=0 的问题
  return synthSentenceByWs(sentence, filePath);
}

async function synthSentenceWithRetry(rawSynth, sentence, filePath) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      await rawSynth(sentence, filePath);
      if (!fileReady(filePath)) {
        throw new Error('合成返回但产物为空文件');
      }
      return true;
    } catch (err) {
      lastError = err;
      // 清理可能残留的半截文件（失败即视为未生成）
      try {
        if (existsSync(filePath)) unlinkSync(filePath);
      } catch { /* 忽略清理失败 */ }
      if (attempt < MAX_RETRY) {
        const wait = RETRY_DELAY_MS[attempt - 1] ?? RETRY_DELAY_MS[RETRY_DELAY_MS.length - 1];
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

// ---------- 简单并发池 ----------
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const cur = cursor++;
      results[cur] = await worker(items[cur], cur);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 本地 Matcha-zh Provider（--provider local，对应 spec Task 7）----------
// 运行时：项目内 venv（.venv-tts，pip install sherpa-onnx soundfile；可用 TTS_PYTHON 覆盖）。
// 模型：third_party/tts-models/matcha-zh/（sherpa-onnx 官方 tts-models release：zh/baker 声学模型 +
//       vocos-22khz-univ 声码器）。流程：常驻 python worker 逐句合成 wav（22050Hz PCM16）
//       → ffmpeg-static 转 24kHz 单声道 32kbps mp3 → 删除临时 wav。
const LOCAL_MODEL_ROOT = resolve(ROOT, 'third_party/tts-models/matcha-zh');
const LOCAL_TIMEOUT_MS = 300000; // 单句最久等待（首句含模型加载，放宽到 5 分钟）
const LOCAL_THREADS = Math.max(1, Math.min(4, cpus().length));

const requireFromScript = createRequire(import.meta.url);

function findLocalPython() {
  if (process.env.TTS_PYTHON) return process.env.TTS_PYTHON;
  const rel = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3';
  for (const venv of [resolve(ROOT, '.venv-tts', rel), resolve(ROOT, '.venv', rel)]) {
    if (existsSync(venv)) return venv;
  }
  return 'python'; // PATH 兜底（不可用时 verify() 给出明确报错）
}

function findLocalFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const p = requireFromScript('ffmpeg-static');
    if (p && existsSync(p)) return p;
  } catch { /* 未安装 ffmpeg-static 时回退 PATH */ }
  return 'ffmpeg';
}

function resolveLocalModel() {
  const base = resolve(LOCAL_MODEL_ROOT, 'matcha-icefall-zh-baker');
  const files = {
    acousticModel: resolve(base, 'model-steps-3.onnx'),
    lexicon: resolve(base, 'lexicon.txt'),
    tokens: resolve(base, 'tokens.txt'),
    vocoder: resolve(LOCAL_MODEL_ROOT, 'vocos-22khz-univ.onnx'),
  };
  const missing = Object.entries(files).filter(([, p]) => !existsSync(p)).map(([k, p]) => k + '=' + p);
  if (missing.length) {
    throw new Error('本地 Matcha-zh 模型缺失：\n  - ' + missing.join('\n  - ') +
      '\n请按 spec Task 7.1 下载/解压到 ' + LOCAL_MODEL_ROOT);
  }
  const fsts = ['phone.fst', 'date.fst', 'number.fst']
    .map((f) => resolve(base, f))
    .filter((p) => existsSync(p));
  return { ...files, ruleFsts: fsts.join(',') };
}

// 运行一条无交互命令；成功 resolve，失败 reject（附 stderr 尾部）
function runHidden(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errOut = '';
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => { errOut += d; });
    let done = false;
    p.on('error', (e) => {
      if (done) return;
      done = true;
      rejectPromise(e);
    });
    p.on('close', (code) => {
      if (done) return;
      done = true;
      if (code === 0) resolvePromise();
      else rejectPromise(new Error('`' + cmd + ' ' + args.join(' ') + '` 退出码 ' + code + '：' +
        errOut.trim().split('\n').slice(-2).join(' ')));
    });
  });
}

// 常驻 python worker：逐句 JSON 请求（stdin）→ JSON 应答（stdout）；崩溃/超时后由重试兜底重启。
class LocalWorker {
  constructor(python, args) {
    this.python = python;
    this.args = args;
    this.proc = null;
    this.buf = '';
    this.resolvers = [];
  }
  ensureAlive() {
    if (this.proc && this.proc.exitCode === null) return;
    const p = spawn(this.python, this.args, { stdio: ['pipe', 'pipe', 'inherit'] });
    this.proc = p;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      this.buf += d;
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (line) this.handleLine(line);
      }
    });
    p.on('error', (err) => {
      this.failAll(err);
    });
    p.on('exit', (code) => {
      const isCurrent = this.proc === p;
      this.proc = null;
      if (isCurrent && this.resolvers.length) {
        this.failAll(new Error('本地 TTS worker 提前退出（code=' + code + '）'));
      }
    });
  }
  handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // 非 JSON（如模型日志混入 stdout）——忽略
    }
    const i = this.resolvers.findIndex((r) => r.wav === msg.wav);
    if (i < 0) return; // 迟到的旧应答，忽略
    const r = this.resolvers.splice(i, 1)[0];
    if (msg.ok) r.resolve();
    else r.reject(new Error('本地合成失败：' + (msg.error || '未知错误')));
  }
  failAll(err) {
    const rs = this.resolvers.splice(0);
    for (const r of rs) r.reject(err);
  }
  synth(text, wavPath) {
    this.ensureAlive();
    const p = this.proc;
    if (!p || p.exitCode !== null || p.stdin.destroyed) {
      return Promise.reject(new Error('本地 TTS worker 不可用（python=' + this.python + '）'));
    }
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        const i = this.resolvers.findIndex((r) => r.wav === wavPath);
        if (i >= 0) this.resolvers.splice(i, 1);
        try { p.kill(); } catch { /* 忽略 */ }
        rejectPromise(new Error('本地 TTS 单句超时（>' + LOCAL_TIMEOUT_MS + 'ms）'));
      }, LOCAL_TIMEOUT_MS);
      this.resolvers.push({
        wav: wavPath,
        resolve: () => { clearTimeout(timer); resolvePromise(); },
        reject: (e) => { clearTimeout(timer); rejectPromise(e); },
      });
      p.stdin.write(JSON.stringify({ wav: wavPath, text }) + '\n', 'utf8');
    });
  }
  close() {
    try {
      if (this.proc && this.proc.exitCode === null) this.proc.stdin.end();
    } catch { /* 忽略 */ }
  }
}

function buildWorkerArgs(model) {
  const args = [
    resolve(ROOT, 'scripts/tts-matcha-worker.py'),
    '--acoustic-model', model.acousticModel,
    '--vocoder', model.vocoder,
    '--lexicon', model.lexicon,
    '--tokens', model.tokens,
    '--num-threads', String(LOCAL_THREADS),
  ];
  if (model.ruleFsts) args.push('--rule-fsts', model.ruleFsts);
  return args;
}

// 单句：python 合成 wav → ffmpeg 转 mp3（24kHz 单声道 32kbps）→ 无论成败清理临时 wav
async function localSynthSentence(worker, ffmpeg, sentence, mp3Path) {
  const wavPath = mp3Path.replace(/\.mp3$/i, '.wav');
  try {
    await worker.synth(sentence, wavPath);
    if (!fileReady(wavPath)) throw new Error('本地合成返回但 wav 缺失/为空');
    try {
      await runHidden(ffmpeg, [
        '-y', '-loglevel', 'error',
        '-i', wavPath,
        '-ac', '1', '-ar', '24000', '-b:a', '32k', '-codec:a', 'libmp3lame',
        mp3Path,
      ]);
    } catch (err) {
      try { if (existsSync(mp3Path)) unlinkSync(mp3Path); } catch { /* 忽略 */ }
      throw new Error('mp3 转码失败：' + err.message);
    }
    if (!fileReady(mp3Path)) throw new Error('转码完成但 mp3 缺失/为空');
  } finally {
    try { if (existsSync(wavPath)) unlinkSync(wavPath); } catch { /* 忽略 */ }
  }
}

// 清理运行中残留的临时 wav（manifest 只引用 .mp3，绝不删到正式产物）
function removeStrayLocalWavs() {
  if (!existsSync(AUDIO_ROOT)) return;
  for (const name of readdirSync(AUDIO_ROOT, { recursive: true })) {
    if (typeof name === 'string' && name.toLowerCase().endsWith('.wav')) {
      try { unlinkSync(resolve(AUDIO_ROOT, name)); } catch { /* 忽略 */ }
    }
  }
}

function createLocalProvider() {
  const python = findLocalPython();
  const ffmpeg = findLocalFfmpeg();
  const model = resolveLocalModel();
  const worker = new LocalWorker(python, buildWorkerArgs(model));
  return {
    python,
    ffmpeg,
    model,
    async verify() {
      try {
        await runHidden(python, ['-c', 'import sherpa_onnx, soundfile']);
      } catch (err) {
        throw new Error('本地 TTS 所需 Python 环境不可用：' + err.message +
          '\n请先执行：.venv-tts\\Scripts\\python -m pip install sherpa-onnx soundfile（或设置 TTS_PYTHON）');
      }
      try {
        await runHidden(ffmpeg, ['-version']);
      } catch (err) {
        throw new Error('本地 TTS 所需 ffmpeg 不可用：' + err.message +
          '\n请先执行：npm i -D ffmpeg-static（或设置 FFMPEG_PATH）');
      }
    },
    synth: (sentence, mp3Path) => localSynthSentence(worker, ffmpeg, sentence, mp3Path),
    close: () => worker.close(),
  };
}

// ---------- 校验（dry-run 与实跑共用）----------
function collectPlan(sources, onlyCategory) {
  const categories = onlyCategory
    ? sources.categories.filter((c) => c === onlyCategory)
    : sources.categories;
  if (!categories.length) {
    throw new Error('类目 "' + onlyCategory + '" 不存在。可用类目：' + sources.categories.join(' / '));
  }
  const plan = []; // { id, category, text, sentences }
  for (const category of categories) {
    const ids = Object.keys(sources.items).filter(
      (id) => sources.items[id].category === category,
    );
    if (onlyCategory && ids.length === 0) {
      throw new Error('类目 "' + onlyCategory + '" 下没有任何源项');
    }
    for (const id of ids) {
      const text = sources.items[id].text.trim();
      const sentences = splitSentences(text);
      if (sentences.length === 0) {
        throw new Error('内容项 "' + id + '" 拆句后为空（文案可能不含任何句末标点）');
      }
      plan.push({ id, category, text, sentences });
    }
  }
  return plan;
}

function printReport(plan) {
  const byCat = new Map();
  for (const item of plan) {
    const c = item.category;
    if (!byCat.has(c)) byCat.set(c, { items: 0, sentences: 0, chars: 0 });
    const s = byCat.get(c);
    s.items += 1;
    s.sentences += item.sentences.length;
    s.chars += item.text.length;
  }
  log('类目                  项数    句数     字符');
  for (const [c, s] of byCat) {
    log(
      '  ' + c.padEnd(18) +
      String(s.items).padStart(5) +
      String(s.sentences).padStart(8) +
      String(s.chars).padStart(10),
    );
  }
}

function runDryRun(plan) {
  log('=== dry-run 离线校验通过 ===');
  printReport(plan);
  log('共 ' + plan.length + ' 个内容项待合成，预计生成 mp3 句数 = ' +
    plan.reduce((n, i) => n + i.sentences.length, 0));
}

// ---------- 实跑：逐类目生成 ----------
// cfg.synthRaw: (sentence, mp3Path) => Promise 单句合成（edge=EdgeTTS，local=Matcha worker+ffmpeg）
// cfg.concurrency / cfg.gapMs：调度参数；缺省即 edge 分支既有节奏（MAX_CONCURRENCY / REQUEST_GAP_MS）
async function runGenerate(sources, onlyCategory, cfg = {}) {
  const synthRaw = cfg.synthRaw || synthSentence;
  const concurrency = cfg.concurrency == null ? MAX_CONCURRENCY : cfg.concurrency;
  const gapMs = cfg.gapMs == null ? REQUEST_GAP_MS : cfg.gapMs;
  const force = !!cfg.force; // true：覆写已存在文件（参数变更后的整库重生成）
  const plan = collectPlan(sources, onlyCategory);

  // 载入旧 manifest（增量合并：未在本轮重跑的类目条目保留，但其文件缺失/为空则剔除）
  let oldItems = {};
  if (existsSync(MANIFEST_PATH)) {
    try {
      const old = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      if (old && typeof old.items === 'object') oldItems = old.items;
    } catch {
      log('警告：既有 manifest.json 解析失败，将重新生成。');
    }
  }

  mkdirSync(AUDIO_ROOT, { recursive: true });

  const newItems = {}; // 本轮成功（含跳过）的 contentId -> manifest 条目
  const stats = { generated: 0, skipped: 0, failedFiles: [], newFilesBytes: 0, totalBytes: 0 };

  const taskList = [];
  for (const item of plan) {
    const dir = resolve(AUDIO_ROOT, item.category, item.id);
    item.dir = dir;
    taskList.push({ item, sentences: item.sentences });
  }

  for (const { item, sentences } of taskList) {
    const dir = item.dir;
    mkdirSync(dir, { recursive: true });
    const files = [];
    const missingIndexes = [];
    let allReady = true;
    sentences.forEach((sentence, idx) => {
      const p = resolve(dir, 's' + idx + '.mp3');
      files.push(p);
      if (fileReady(p) && !force) {
        stats.skipped += 1;
      } else {
        allReady = false;
        missingIndexes.push(idx);
      }
    });

    const itemFailed = [];
    if (missingIndexes.length > 0) {
      // 只补缺句；逐句调度，受并发上限约束
      await mapLimit(missingIndexes, concurrency, async (idx) => {
        const sentence = sentences[idx];
        const filePath = files[idx];
        await sleep(gapMs);
        try {
          await synthSentenceWithRetry(synthRaw, sentence, filePath);
          stats.generated += 1;
          stats.newFilesBytes += statSync(filePath).size;
        } catch (err) {
          itemFailed.push({ idx, file: relAsset(filePath), reason: String(err && err.message || err) });
          // 重试仍失败多半是接口限流/临时故障：冷却一段再继续，避免雪崩
          await sleep(GLOBAL_COOLDOWN_MS);
        }
      });
    }
    if (itemFailed.length > 0) {
      log('  ✗ ' + item.id + '：失败 ' + itemFailed.length + '/' + sentences.length + ' 句');
      for (const f of itemFailed) log('      - ' + f.file + '  ' + f.reason);
      stats.failedFiles.push(...itemFailed.map((f) => f.file));
      continue; // 该内容项不写入 manifest（避免运行端引用到缺句）
    }

    // 全部句子就绪 → 该 contentId 完成
    newItems[item.id] = {
      category: item.category,
      sentences,
      files: files.map((p) => relAsset(p)),
    };
  }

  // 合并 manifest
  const mergedItems = {};
  for (const item of plan) {
    if (newItems[item.id]) mergedItems[item.id] = newItems[item.id];
  }
  for (const [id, entry] of Object.entries(oldItems)) {
    if (mergedItems[id]) continue; // 本轮已覆盖
    const valid = Array.isArray(entry.files) && entry.files.every((f) => fileReady(resolve(ROOT, f)));
    if (valid) mergedItems[id] = entry;
  }
  const manifest = { version: 1, items: mergedItems };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 统计全部已入库音频体积（按 manifest 计算）
  for (const entry of Object.values(mergedItems)) {
    for (const f of entry.files) {
      try {
        stats.totalBytes += statSync(resolve(ROOT, f)).size;
      } catch { /* 文件极罕见缺失时忽略 */ }
    }
  }

  return { plan, newItems, stats };
}

function printGenerateReport({ plan, stats }) {
  const summary = new Map();
  for (const item of plan) {
    const s = summary.get(item.category) || { items: 0, files: 0 };
    s.items += 1;
    s.files += item.sentences.length;
    summary.set(item.category, s);
  }
  log('=== 生成结果 ===');
  log('类目                  项数    应含句数');
  for (const [c, s] of summary) {
    log('  ' + c.padEnd(18) + String(s.items).padStart(5) + String(s.files).padStart(10));
  }
  log('本次新合成句数：' + stats.generated + '；本次跳过（已存在）句数：' + stats.skipped);
  log('本轮新文件字节：' + stats.newFilesBytes);
  if (stats.failedFiles.length) {
    log('失败（未完成）句数：' + stats.failedFiles.length);
    for (const f of stats.failedFiles) log('  ✗ ' + f);
  }
  log('manifest 条目数：' + Object.keys(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).items).length);
  log('manifest 累计音频总字节：' + stats.totalBytes);
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = loadSources();
  const plan = collectPlan(sources, args.only);

  if (args.dryRun) {
    runDryRun(plan);
    return;
  }

  const isLocal = args.provider === 'local';
  let provider = null;
  if (isLocal) {
    provider = createLocalProvider();
    await provider.verify();
    removeStrayLocalWavs();
    log('=== 开始生成（provider=local · sherpa-onnx Matcha-zh · CPU 线程 ' + LOCAL_THREADS + '，重试=' + MAX_RETRY + '）===');
    log('  声学模型：' + provider.model.acousticModel);
    log('  词表：' + provider.model.tokens + '；词典：' + provider.model.lexicon);
    log('  声码器：' + provider.model.vocoder);
    log('  python=' + provider.python + '；ffmpeg=' + provider.ffmpeg);
  } else {
    log('=== 开始生成（provider=edge · voice=' + VOICE + '，rate=' + RATE +
      '，并发=' + MAX_CONCURRENCY + '，重试=' + MAX_RETRY +
      (args.force ? '，force=覆写' : '') + '）===');
  }

  const result = await runGenerate(
    sources,
    args.only,
    isLocal
      ? { synthRaw: provider.synth, concurrency: 1, gapMs: 0, force: args.force }
      : { force: args.force },
  );
  printGenerateReport(result);

  if (isLocal) provider.close();

  if (result.stats.failedFiles.length > 0) {
    log('\n有 ' + result.stats.failedFiles.length + ' 句生成失败，未写入 manifest。');
    log('可稍后重跑补生成：node scripts/gen-tts-audio.mjs --provider ' + args.provider +
      (args.only ? ' --only ' + args.only : ''));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('错误：' + (err && err.message ? err.message : err));
  process.exitCode = 1;
}).finally(() => {
  // 兜底结束进程：避免失败请求遗留的 WebSocket 句柄挂住 CLI
  setTimeout(() => process.exit(process.exitCode || 0), 300);
});

/**
 * api/tts.js —— Vercel 云函数：Edge-tts（晓晓 zh-CN-XiaoxiaoNeural）实时 TTS 代理
 *
 * 用途：让 AI 页动态文本能以与静态语音完全一致的音色（Edge-tts 晓晓）实时合成，
 *       输出格式 audio-24khz-32kbitrate-mono-mp3（与 scripts/gen-tts-audio.mjs 一致）。
 *
 * 局限（前端需自行回退）：
 *   - 依赖微软 Edge 在线 TTS 的非官方接口（node-edge-tts），无 SLA，随时可能失效或被限流；
 *   - 本函数做了 IP 限流（每分钟 12 次）与文本/句数上限（≤1000 字符、≤16 句）；
 *   - 超限或合成失败的剩余句子以 truncated:true 标记，由前端决定降级/回退策略；
 *   - 单次总耗时可接近 55s（云函数 maxDuration=60s），请配合前端 loading 超时。
 *
 * 安全：本函数不读取 / 不暴露任何 API key，也不向客户端透传任何密钥。
 */
import { EdgeTTS } from 'node-edge-tts';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---- 校验与调度常量 ----
const MAX_REQUEST_BYTES = 8192; // 请求体上限 8KB
const MAX_TEXT_CHARS = 1000; // 单次朗读文本上限
const MAX_SENTENCES = 16; // 最多合成的句数
const MAX_TIMEOUT_MS = 55000; // 总超时（云函数 maxDuration=60s）
const PER_SENTENCE_TIMEOUT_MS = 30000; // 单句合成超时（与静态脚本一致，对长句偏宽松）
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 12;

// ---- Edge-tts 音色参数（与 scripts/gen-tts-audio.mjs 保持一致以保证音色完全一致）----
const VOICE = 'zh-CN-XiaoxiaoNeural'; // 晓晓（温柔女声）
const LANG = 'zh-CN';
const OUTPUT_FORMAT = 'audio-24khz-32kbitrate-mono-mp3';
const RATE = '+0%';
const PITCH = 'default';
const VOLUME = 'default';

// 拆句：与静态生成一致，按中文句末标点切分并忽略空串（另支持换行）
const SPLIT_RE = /[。！？!?…\n]/;
const SPEAKABLE_RE = /[\p{Script=Han}A-Za-z0-9]/u;

const requestLog = new Map();

console.log('[api/tts.js] Edge-tts 实时 TTS 云函数已加载（voice=' + VOICE + ', maxSentences=' + MAX_SENTENCES + '）');

function sendJson(res, status, body, headers) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(headers || {})) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

function corsHeaders() {
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || '').trim();
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function isAllowedOrigin(req) {
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || '').trim();
  return Boolean(req.headers.origin && allowedOrigin && req.headers.origin === allowedOrigin);
}

function withinRateLimit(req) {
  const now = Date.now();
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || '').split(',')[0].trim();
  const key = clientIp || 'unknown';
  const timestamps = (requestLog.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return true;
}

// 拆句（与静态生成同一规则）
function splitSentences(text) {
  return text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s && SPEAKABLE_RE.test(s));
}

// 逐句合成：ttsPromise 直接写入临时文件，读回 Buffer 后删除临时文件
async function synthesize(text, filePath, ttsTimeoutMs) {
  const tts = new EdgeTTS({
    voice: VOICE,
    lang: LANG,
    outputFormat: OUTPUT_FORMAT,
    rate: RATE,
    pitch: PITCH,
    volume: VOLUME,
    timeout: ttsTimeoutMs,
  });
  try {
    await tts.ttsPromise(text, filePath);
    const buffer = readFileSync(filePath);
    return buffer.toString('base64');
  } finally {
    // 无论成败都清理临时文件（合成失败可能残留半截文件）
    try { unlinkSync(filePath); } catch { /* 忽略清理失败 */ }
  }
}

export default async function handler(req, res) {
  const headers = corsHeaders();
  if (req.method === 'OPTIONS') {
    res.status(204);
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.end();
    return;
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }, { ...headers, Allow: 'POST, OPTIONS' });
  if (!isAllowedOrigin(req)) return sendJson(res, 403, { error: 'Origin not allowed.' }, headers);
  if (!withinRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' }, headers);

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_REQUEST_BYTES) return sendJson(res, 413, { error: 'Request body is too large.' }, headers);
  const text = req.body && req.body.text;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS) {
    return sendJson(res, 400, { error: 'text must be a non-empty string under 1000 characters.' }, headers);
  }

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return sendJson(res, 400, { error: 'Text contains no speakable content.' }, headers);
  }

  const target = sentences.slice(0, MAX_SENTENCES);
  let truncated = sentences.length > MAX_SENTENCES;
  const results = [];
  const startedAt = Date.now();

  for (const sentence of target) {
    const remaining = MAX_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) { truncated = true; break; }

    const filePath = join(tmpdir(), 'ww-tts-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mp3');
    try {
      // Promise.race：以总超时兜底，之外再叠加 per-sentence 超时（ttsPromise 内部已自带 timeout）
      const audioBase64 = await Promise.race([
        synthesize(sentence, filePath, Math.min(PER_SENTENCE_TIMEOUT_MS, remaining)),
        new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('synthesis timed out'), { name: 'AbortError' })), remaining),
        ),
      ]);
      results.push({ text: sentence, audioBase64 });
    } catch (err) {
      // 总超时：即使已有部分成功也按 504 返回（整个请求无法在时限内完成）
      if (err && err.name === 'AbortError') {
        return sendJson(res, 504, { error: 'TTS synthesis timed out.' }, headers);
      }
      // 某一句失败：若前面已有成功句，返回已成功部分并标记 truncated
      if (results.length > 0) {
        truncated = true;
        break;
      }
      // 全部失败
      return sendJson(res, 502, { error: 'TTS synthesis failed.' }, headers);
    }
  }

  return sendJson(res, 200, { sentences: results, truncated }, headers);
}
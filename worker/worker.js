const MAX_REQUEST_BYTES = 4096;
const MAX_MESSAGE_CHARS = 1000;
const MAX_REPLY_CHARS = 2000;
const MAX_TIMEOUT_MS = 20000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestLog = new Map();

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }, headers || {}),
  });
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN || '').trim();
  return Boolean(origin && allowed && origin === allowed);
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function withinRateLimit(request) {
  const now = Date.now();
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const timestamps = (requestLog.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return true;
}

export default {
  async fetch(request, env) {
    const headers = isAllowedOrigin(request, env) ? corsHeaders(request) : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, Object.assign({ Allow: 'POST, OPTIONS' }, headers));
    if (!isAllowedOrigin(request, env)) return json({ error: 'Origin not allowed.' }, 403);
    if (!withinRateLimit(request)) return json({ error: 'Too many requests. Please try again later.' }, 429, headers);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) return json({ error: 'Request body is too large.' }, 413, headers);
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Expected a JSON object with a message string.' }, 400, headers); }
    const message = payload && payload.message;
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
      return json({ error: 'Message must be a non-empty string under 1000 characters.' }, 400, headers);
    }
    if (!env.SILICONFLOW_API_KEY) return json({ error: 'AI service is not configured.' }, 503, headers);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
    try {
      const upstream = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.SILICONFLOW_API_KEY },
        body: JSON.stringify({
          model: env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B',
          messages: [
            { role: 'system', content: '你是潮州木雕非遗数字人。请使用中文，基于可靠公开知识简洁回答；不确定时明确说明。' },
            { role: 'user', content: message.trim() },
          ],
          max_tokens: 500,
        }),
        signal: controller.signal,
      });
      if (!upstream.ok) return json({ error: 'AI service is temporarily unavailable.' }, 502, headers);
      const data = await upstream.json();
      const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof reply !== 'string' || !reply.trim()) return json({ error: 'AI service returned an invalid response.' }, 502, headers);
      return json({ reply: reply.slice(0, MAX_REPLY_CHARS) }, 200, headers);
    } catch (error) {
      return json({ error: 'AI service is temporarily unavailable.' }, error && error.name === 'AbortError' ? 504 : 502, headers);
    } finally {
      clearTimeout(timer);
    }
  },
};

const MAX_REQUEST_BYTES = 4096;
const MAX_MESSAGE_CHARS = 1000;
const MAX_REPLY_CHARS = 2000;
const MAX_TIMEOUT_MS = 55000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestLog = new Map();

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
  const message = req.body && req.body.message;
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
    return sendJson(res, 400, { error: 'Message must be a non-empty string under 1000 characters.' }, headers);
  }
  if (!process.env.MY_API) return sendJson(res, 503, { error: 'AI service is not configured.' }, headers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  try {
    const upstream = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.MY_API,
      },
      body: JSON.stringify({
        model: process.env.MY_MODEL || 'agnes-2.0-flash',
        messages: [
          { role: 'system', content: '你是潮州木雕非遗数字人。请使用中文，基于可靠公开知识简洁回答；不确定时明确说明。' },
          { role: 'user', content: message.trim() },
        ],
        max_tokens: 600,
        temperature: 0.4,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return sendJson(res, 502, { error: 'AI upstream request failed.', upstreamStatus: upstream.status }, headers);
    }
    const data = await upstream.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return sendJson(res, 502, { error: 'AI service returned an invalid response.' }, headers);
    }
    return sendJson(res, 200, { reply: reply.slice(0, MAX_REPLY_CHARS) }, headers);
  } catch (error) {
    return sendJson(res, error && error.name === 'AbortError' ? 504 : 502, { error: 'AI service is temporarily unavailable.' }, headers);
  } finally {
    clearTimeout(timer);
  }
}

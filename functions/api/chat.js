const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MAX_REQUEST_BYTES = 4_096;
const MAX_MESSAGE_CHARS = 1_000;
const MAX_TIMEOUT_MS = 20_000;
const MAX_REPLY_CHARS = 2_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestLog = new Map();

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
}

function withinRateLimit(request) {
  const now = Date.now();
  const clientIp = getClientIp(request);
  const timestamps = (requestLog.get(clientIp) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  requestLog.set(clientIp, timestamps);
  return true;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      ...extraHeaders,
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!withinRateLimit(request)) {
    return json({ error: 'Too many requests. Please try again later.' }, 429);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Request body is too large.' }, 413);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON object with a message string.' }, 400);
  }

  const message = payload?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
    return json({ error: 'Message must be a non-empty string under 1000 characters.' }, 400);
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: 'AI service is not configured.' }, 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);

  try {
    const upstream = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是潮州木雕非遗数字人。请使用中文，基于可靠公开知识简洁回答；不确定时明确说明。',
          },
          { role: 'user', content: message.trim() },
        ],
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return json({ error: 'AI service is temporarily unavailable.' }, 502);
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return json({ error: 'AI service returned an invalid response.' }, 502);
    }

    return json({ reply: reply.slice(0, MAX_REPLY_CHARS) });
  } catch (error) {
    const status = error?.name === 'AbortError' ? 504 : 502;
    return json({ error: 'AI service is temporarily unavailable.' }, status);
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest() {
  return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}

import http.server
import json
import os
import socketserver
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8124"))
ROOT_DIRECTORY = Path(__file__).resolve().parents[1] / '.edgeone-build'
MAX_REQUEST_BYTES = 4_096
MAX_MESSAGE_CHARS = 1_000
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 12
UPSTREAM_TIMEOUT_SECONDS = 20
PROVIDER_CONFIG = {
    "siliconflow": {
        "url": "https://api.siliconflow.cn/v1/chat/completions",
        "key_env": "SILICONFLOW_API_KEY",
        "model_env": "SILICONFLOW_MODEL",
        "default_model": "Qwen/Qwen3-8B",
    },
    "deepseek": {
        "url": "https://api.deepseek.com/chat/completions",
        "key_env": "DEEPSEEK_API_KEY",
        "model_env": "DEEPSEEK_MODEL",
        "default_model": "deepseek-chat",
    },
}

class WoodWhisperHandler(http.server.SimpleHTTPRequestHandler):
    request_log = defaultdict(deque)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIRECTORY), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "public, max-age=3600")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404, "Not found")
            return
        if not self._within_rate_limit():
            self._send_json(429, {"error": "Too many requests. Please try again later."})
            return
        content_length = self.headers.get("Content-Length")
        if not content_length or not content_length.isdecimal():
            self._send_json(400, {"error": "A valid Content-Length header is required."})
            return
        if int(content_length) > MAX_REQUEST_BYTES:
            self._send_json(413, {"error": "Request body is too large."})
            return
        try:
            payload = json.loads(self.rfile.read(int(content_length)).decode("utf-8"))
            message = payload["message"]
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError):
            self._send_json(400, {"error": "Expected a JSON object with a message string."})
            return
        if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE_CHARS:
            self._send_json(400, {"error": "Message must be a non-empty string under 1000 characters."})
            return
        provider_name = os.environ.get("AI_PROVIDER", "siliconflow").strip().lower()
        provider = PROVIDER_CONFIG.get(provider_name)
        if not provider:
            self._send_json(503, {"error": "AI provider is not configured."})
            return
        api_key = os.environ.get(provider["key_env"])
        if not api_key:
            self._send_json(503, {"error": "AI service is not configured."})
            return
        model = os.environ.get(provider["model_env"], provider["default_model"])
        request_body = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": message.strip()},
            ],
            "max_tokens": 500,
        }).encode("utf-8")
        upstream_request = urllib.request.Request(
            provider["url"], data=request_body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}, method="POST",
        )
        try:
            with urllib.request.urlopen(upstream_request, timeout=UPSTREAM_TIMEOUT_SECONDS) as response:
                upstream_data = json.loads(response.read().decode("utf-8"))
            reply = upstream_data["choices"][0]["message"]["content"]
            if not isinstance(reply, str) or not reply.strip():
                raise ValueError("Empty upstream reply")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError):
            self._send_json(502, {"error": "AI service is temporarily unavailable."})
            return
        self._send_json(200, {"reply": reply[:2_000]})

    def _within_rate_limit(self):
        now = time.monotonic()
        client_requests = self.request_log[self.client_address[0]]
        while client_requests and now - client_requests[0] > RATE_LIMIT_WINDOW_SECONDS:
            client_requests.popleft()
        if len(client_requests) >= RATE_LIMIT_MAX_REQUESTS:
            return False
        client_requests.append(now)
        return True

    @staticmethod
    def _system_prompt():
        return "你是潮州木雕非遗数字人。请使用中文，基于可靠公开知识简洁回答；不确定时明确说明。"

    def _send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {self.client_address[0]} {format % args}")

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    with ThreadingHTTPServer((HOST, PORT), WoodWhisperHandler) as httpd:
        print(f"Server running at http://{HOST}:{PORT}/")
        httpd.serve_forever()

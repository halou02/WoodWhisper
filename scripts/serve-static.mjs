import http from 'node:http';
import os from 'node:os';
import { createReadStream, stat } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

// 默认仅本机访问；手机真机局域网验收时设 HOST=0.0.0.0 开放同一 Wi-Fi 访问
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8125);
const root = resolve(process.cwd(), '.edgeone-build');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  stat(filePath, (error, file) => {
    if (error || !file.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  });
}).listen(port, host, () => {
  console.log(`Static preview: http://${host}:${port}`);
  console.log('Serving the deploy-ready .edgeone-build directory only.');
  console.log('This server does not provide /api/chat. Use the Python server to test AI replies.');
  if (host === '0.0.0.0') {
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => `  http://${n.address}:${port}`);
    if (lan.length) {
      console.log('LAN (phone on the same Wi-Fi):');
      console.log(lan.join('\n'));
    }
  }
});

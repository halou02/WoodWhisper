import http from 'node:http';
import { createReadStream, stat } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const host = '127.0.0.1';
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
});

// Minimal zero-dependency static file server for local dev / testing.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    let s;
    try { s = await stat(filePath); } catch { res.writeHead(404).end('Not found'); return; }
    if (s.isDirectory()) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end('Server error');
  }
});
server.listen(PORT, () => console.log(`Kerb dev server → http://localhost:${PORT}`));

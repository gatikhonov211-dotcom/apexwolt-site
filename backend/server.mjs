// Локальный сервер API для разработки: node backend/server.mjs (порт 8787, меняется через PORT).
// Читает backend/.env (не в Git): DADATA_TOKEN=…  или DADATA_MOCK=1 для теста без токена.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { handler } = await import('./api.mjs');

const PORT = Number(process.env.PORT) || 8787;
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
  req.on('end', async () => {
    const result = await handler({
      httpMethod: req.method,
      path: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body,
      requestContext: { identity: { sourceIp: req.socket.remoteAddress } }
    });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.statusCode === 204 ? undefined : result.body);
  });
}).listen(PORT, () => {
  const mode = process.env.DADATA_MOCK === '1' ? 'тестовый (без DaData)' : process.env.DADATA_TOKEN ? 'DaData подключена' : 'НЕТ ТОКЕНА DaData — поиск по ИНН недоступен';
  console.log(`[api] http://localhost:${PORT} — режим: ${mode}`);
});

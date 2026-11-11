// Nacional Marcenaria e Carpintaria — servidor Node sem dependências.
// Uso: node server.js   (PORT e ADMIN_TOKEN opcionais por variável de ambiente)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3002;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const LEADS = path.join(DATA, 'leads.jsonl');
const WHATSAPP = process.env.WHATSAPP || '551532232626';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};
const TEXT = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.svg']);
const LONG_CACHE = new Set(['.webp', '.jpg', '.png', '.mp4', '.woff2', '.ico']);

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://www.google.com https://maps.google.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; '),
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });

/* ---- Limite: 5 pedidos por IP a cada 10 minutos ---- */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (l.every(t => now - t > 600000)) hits.delete(ip); }, 600000).unref();

function readBody(req, max = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(new Error('grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

async function orcamento(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { erro: 'Muitos pedidos em pouco tempo. Tente de novo em alguns minutos ou chame no WhatsApp.' });
  let d;
  try { d = JSON.parse(await readBody(req)); } catch { return json(res, 400, { erro: 'Pedido inválido.' }); }
  if (d.empresa) return json(res, 200, { ok: true }); // campo-isca preenchido: robô, ignora em silêncio
  const nome = clean(d.nome, 80);
  const telefone = clean(d.telefone, 20).replace(/\D/g, '');
  const ambiente = clean(d.ambiente, 60);
  const mensagem = clean(d.mensagem, 800);
  const erros = [];
  if (nome.length < 2) erros.push('nome');
  if (telefone.length < 10 || telefone.length > 13) erros.push('telefone');
  if (!ambiente) erros.push('ambiente');
  if (erros.length) return json(res, 422, { erro: 'Confira os campos.', campos: erros });

  const lead = { id: crypto.randomUUID(), em: new Date().toISOString(), nome, telefone, ambiente, mensagem };
  await fs.promises.mkdir(DATA, { recursive: true });
  await fs.promises.appendFile(LEADS, JSON.stringify(lead) + '\n');

  const texto = `Olá, vim pelo site e quero pedir um orçamento.\nNome: ${nome}\nAmbiente: ${ambiente}${mensagem ? `\nMensagem: ${mensagem}` : ''}`;
  json(res, 201, WHATSAPP ? { ok: true, whatsapp: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}` } : { ok: true });
}

async function leads(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const ok = ADMIN_TOKEN && token.length === ADMIN_TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN));
  if (!ok) return json(res, 401, { erro: 'Não autorizado.' });
  let raw = '';
  try { raw = await fs.promises.readFile(LEADS, 'utf8'); } catch { /* sem pedidos ainda */ }
  json(res, 200, raw.split('\n').filter(Boolean).map(l => JSON.parse(l)));
}

async function estatico(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  let file = path.normalize(path.join(PUBLIC, rel));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');

  let stat;
  try { stat = await fs.promises.stat(file); if (stat.isDirectory()) { file = path.join(file, 'index.html'); stat = await fs.promises.stat(file); } }
  catch { return send(res, 404, 'Página não encontrada', { 'Content-Type': MIME['.txt'] }); }

  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': LONG_CACHE.has(ext) ? 'public, max-age=2592000' : 'no-cache',
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);

  // Range (vídeo no Safari)
  const range = req.headers.range;
  if (range && ext === '.mp4') {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? +m[1] : 0;
    let end = m && m[2] ? +m[2] : stat.size - 1;
    if (!m || start > end || end >= stat.size) return send(res, 416, null, { 'Content-Range': `bytes */${stat.size}` });
    res.writeHead(206, { ...SECURITY, ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  const enc = req.headers['accept-encoding'] || '';
  if (TEXT.has(ext) && /\bbr\b/.test(enc)) {
    res.writeHead(200, { ...SECURITY, ...headers, 'Content-Encoding': 'br' });
    return fs.createReadStream(file).pipe(zlib.createBrotliCompress()).pipe(res);
  }
  if (TEXT.has(ext) && /\bgzip\b/.test(enc)) {
    res.writeHead(200, { ...SECURITY, ...headers, 'Content-Encoding': 'gzip' });
    return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  }
  res.writeHead(200, { ...SECURITY, ...headers, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/orcamento') return req.method === 'POST' ? orcamento(req, res) : json(res, 405, { erro: 'Use POST.' });
    if (pathname === '/api/leads') return req.method === 'GET' ? leads(req, res) : json(res, 405, { erro: 'Use GET.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    await estatico(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { erro: 'Erro interno.' });
  }
}).listen(PORT, () => console.log(`Nacional Marcenaria e Carpintaria em http://localhost:${PORT}`));

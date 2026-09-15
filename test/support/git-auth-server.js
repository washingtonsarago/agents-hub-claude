#!/usr/bin/env node
// Remoto HTTP local autenticado — infraestrutura de teste (T2 da demanda
// 001-ahc-pat-auth). Faz o papel do canônico `EMS-NCTECH/agents-hub-claude`
// nos testes de CI, sem rede e sem nenhum token real.
//
// Por que processo filho: `runAhc`/`runInstall` usam `spawnSync`, que bloqueia
// o event loop do processo de teste. Um servidor no mesmo processo nunca
// responderia às requisições do `git` filho. Por isso este arquivo é um
// executável separado, iniciado por `startAuthRemote()` em test/helpers.js.
//
// O que ele faz:
//   - envolve o `git http-backend` via CGI (protocolo smart HTTP);
//   - exige Basic auth em toda requisição e responde 401 + WWW-Authenticate
//     quando falta credencial ou quando a credencial é recusada;
//   - lê as credenciais aceitas de um JSON **a cada requisição**, para o teste
//     poder trocá-las com o servidor no ar (AC-08: T_OLD → T_NEW);
//   - registra num arquivo, em ordem, o header `Authorization` de cada
//     `GET .../info/refs` que traz credencial. A requisição anônima inicial da
//     rodada `git` (a que provoca o desafio 401) não entra no log, porque o
//     que o AC-14 mede é a ordem das credenciais apresentadas.
//
// Uso: node git-auth-server.js --root <dir> --creds <json> --log <arquivo>
// Publica `{"port":<n>}` numa linha no stdout assim que está ouvindo.

const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// ---- argumentos ------------------------------------------------------------

function arg(name, fallback) {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] !== undefined) return argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`git-auth-server: faltou --${name}`);
}

const ROOT = arg('root');
const CREDS_FILE = arg('creds');
const LOG_FILE = arg('log');
const REALM = arg('realm', 'ahc-test');

// ---- credenciais aceitas ---------------------------------------------------

// Relido a cada requisição de propósito: o teste troca o arquivo em tempo de
// execução e a próxima rodada de git já enxerga a lista nova.
function acceptedSecrets() {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw && raw.accepted;
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

// `Basic base64("<user>:<secret>")`. O que identifica a origem é o segredo:
// as rodadas de token usam o usuário fixo `x-access-token`, a rodada `git` usa
// o usuário que o credential helper devolver.
function parseAuthorization(header) {
  if (!header) return null;
  const m = /^Basic[ \t]+([A-Za-z0-9+/=]+)[ \t]*$/i.exec(String(header).trim());
  if (!m) return { scheme: 'unsupported', user: '', secret: '' };
  let decoded;
  try {
    decoded = Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return { scheme: 'unsupported', user: '', secret: '' };
  }
  const i = decoded.indexOf(':');
  return i === -1
    ? { scheme: 'Basic', user: '', secret: decoded }
    : { scheme: 'Basic', user: decoded.slice(0, i), secret: decoded.slice(i + 1) };
}

function logAuthorization(header) {
  // Append síncrono: o teste lê o arquivo logo depois que o git termina, e
  // uma escrita assíncrona poderia ainda não ter chegado ao disco.
  fs.appendFileSync(LOG_FILE, `${String(header).trim()}\n`);
}

// ---- CGI para o git http-backend -------------------------------------------

function unauthorized(req, res, detail) {
  req.resume(); // drena o corpo, senão o socket fica preso
  res.writeHead(401, {
    'WWW-Authenticate': `Basic realm="${REALM}"`,
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache',
  });
  res.end(`401 unauthorized (${detail})\n`);
}

function runBackend(req, res, pathInfo, queryString, remoteUser) {
  const env = {
    PATH: process.env.PATH,
    // HOME dentro do próprio root: sem GIT_CONFIG_NOSYSTEM + HOME neutro o
    // backend leria a config do dev que estiver rodando os testes.
    HOME: ROOT,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_PROJECT_ROOT: ROOT,
    GIT_HTTP_EXPORT_ALL: '1',
    GIT_HTTP_MAX_REQUEST_BUFFER: '100M',
    REQUEST_METHOD: req.method,
    PATH_INFO: pathInfo,
    QUERY_STRING: queryString,
    REMOTE_USER: remoteUser || 'anonymous',
    REMOTE_ADDR: req.socket.remoteAddress || '127.0.0.1',
    SERVER_PROTOCOL: `HTTP/${req.httpVersion || '1.1'}`,
  };
  if (req.headers['content-type']) env.CONTENT_TYPE = req.headers['content-type'];
  if (req.headers['content-length']) env.CONTENT_LENGTH = req.headers['content-length'];
  // O git manda `git-upload-pack` com corpo gzipado; sem esta variável o
  // http-backend entrega o corpo comprimido ao upload-pack e o clone quebra.
  if (req.headers['content-encoding']) {
    env.HTTP_CONTENT_ENCODING = req.headers['content-encoding'];
  }

  const child = spawn('git', ['http-backend'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = [];
  let errText = '';
  let done = false;

  const fail = (msg) => {
    if (done) return;
    done = true;
    req.resume();
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`git http-backend: ${msg}\n`);
  };

  child.on('error', (e) => fail(e.message));
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', (c) => { errText += c.toString(); });

  child.on('close', () => {
    if (done) return;
    const buf = Buffer.concat(out);
    let sep = buf.indexOf('\r\n\r\n');
    let sepLen = 4;
    if (sep === -1) { sep = buf.indexOf('\n\n'); sepLen = 2; }
    if (sep === -1) { fail(errText.trim() || 'resposta CGI sem cabeçalhos'); return; }

    const headers = {};
    let status = 200;
    for (const line of buf.slice(0, sep).toString('utf8').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i === -1) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (key.toLowerCase() === 'status') {
        status = parseInt(value, 10) || 500;
        continue;
      }
      headers[key] = value;
    }
    done = true;
    res.writeHead(status, headers);
    res.end(buf.slice(sep + sepLen));
  });

  req.pipe(child.stdin);
  req.on('error', () => child.kill());
}

// ---- servidor --------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathInfo = decodeURIComponent(url.pathname);
  const queryString = url.search ? url.search.slice(1) : '';
  const isInfoRefs = req.method === 'GET' && /\/info\/refs$/.test(pathInfo);

  const cred = parseAuthorization(req.headers.authorization);
  if (!cred) {
    // Sem credencial: é a requisição anônima que provoca o desafio. Não entra
    // no log — o que o AC-14 mede é a ordem das credenciais apresentadas.
    unauthorized(req, res, 'sem credencial');
    return;
  }

  if (isInfoRefs) logAuthorization(req.headers.authorization);

  if (cred.scheme !== 'Basic' || !acceptedSecrets().includes(cred.secret)) {
    unauthorized(req, res, 'credencial recusada');
    return;
  }

  runBackend(req, res, pathInfo, queryString, cred.user);
});

server.on('clientError', (e, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { server.close(() => process.exit(0)); process.exit(0); });
}

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`);
});

// Shared test helpers — zero-dep.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_REMOTE = path.join(__dirname, 'fixtures', 'remote');
const AHC_BIN = path.join(REPO_ROOT, 'bin', 'ahc');
const INSTALL_SH = path.join(REPO_ROOT, 'install.sh');
const REGEN_SCRIPT = path.join(REPO_ROOT, 'scripts', 'regen-manifest.js');
const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-artifacts.js');
const AUTH_SERVER = path.join(__dirname, 'support', 'git-auth-server.js');
const CRED_HELPER = path.join(__dirname, 'support', 'cred-helper.sh');
const DEFAULT_HUB_REPO = 'EMS-NCTECH/agents-hub-claude';

function makeTmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-home-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-repo-'));
  return dir;
}

// Copy a directory tree (no symlinks expected in fixtures).
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function writeConfig(home, cfg) {
  fs.writeFileSync(
    path.join(home, '.claude', '.ahc-config.json'),
    JSON.stringify(cfg, null, 2)
  );
}

function readLock(home) {
  const p = path.join(home, '.claude', '.ahc-lock.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeLock(home, lock) {
  fs.writeFileSync(
    path.join(home, '.claude', '.ahc-lock.json'),
    JSON.stringify(lock, null, 2) + '\n'
  );
}

function sha256OfFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// Run ahc CLI under a tmp HOME pointing at a file:// remote.
function runAhc(home, args, opts = {}) {
  return spawnSync('node', [AHC_BIN, ...args], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home, // for git-bash on Windows in the future
    },
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  });
}

// Run regen-manifest.js with cwd set to a given repo root.
function runRegen(repoCwd, args = []) {
  return spawnSync('node', [REGEN_SCRIPT, ...args], {
    cwd: repoCwd,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env },
  });
}

// Run validate-artifacts.js with cwd set to a given repo root.
function runValidator(repoCwd, args = []) {
  return spawnSync('node', [VALIDATOR, ...args], {
    cwd: repoCwd,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env },
  });
}

// Build a self-contained tmp repo containing only what regen/validator need
// (manifest + agents/commands/skills directories), copied from the fixture.
function makeMinimalRepo() {
  const dir = makeTmpRepo();
  copyTree(FIXTURE_REMOTE, dir);
  // The fixture imports the script paths from REPO_ROOT — we run scripts via
  // absolute paths but cwd to this dir. Manifest lives at <dir>/manifest.json.
  return dir;
}

// Mutate the manifest in place.
function patchManifest(repoDir, mutator) {
  const p = path.join(repoDir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  mutator(m);
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}

function rmrf(p) {
  if (!p) return;
  fs.rmSync(p, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Harness do remoto autenticado (T2 de 001-ahc-pat-auth)
//
// Todos os valores de credencial que passam por aqui são fictícios e literais
// nos testes (T_EMBUTIDO, T_ENV, T_CFG, C_DEV...). Nenhum token real é lido,
// escrito ou impresso por este harness.
// ---------------------------------------------------------------------------

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Env mínimo e determinístico para rodar `git` fora do ambiente do dev.
function isolatedGitEnv(home) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'ahc test',
    GIT_AUTHOR_EMAIL: 'ahc-test@example.invalid',
    GIT_COMMITTER_NAME: 'ahc test',
    GIT_COMMITTER_EMAIL: 'ahc-test@example.invalid',
  };
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
    env: opts.env || isolatedGitEnv(opts.home || os.tmpdir()),
  });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} falhou (exit ${r.status}): ${(r.stderr || r.stdout || '').trim()}`
    );
  }
  return r;
}

// Rede de segurança: um servidor que escapar do `close()` (teste que estourou
// antes do after, exceção no meio do setup) morre junto com o processo de teste.
const LIVE_REMOTES = new Set();
let exitGuardInstalled = false;
function installExitGuard() {
  if (exitGuardInstalled) return;
  exitGuardInstalled = true;
  process.on('exit', () => {
    for (const child of LIVE_REMOTES) {
      try { child.kill('SIGKILL'); } catch { /* já morreu */ }
    }
  });
}

// Sobe o remoto HTTP local autenticado como processo filho e espera a porta.
// Assíncrono de propósito: o servidor só responde enquanto o processo de teste
// não está bloqueado, e `runAhc` usa spawnSync.
function startAuthRemote(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-remote-'));
  const root = path.join(dir, 'root');
  const credsFile = path.join(dir, 'accepted.json');
  const logFile = path.join(dir, 'authorization.log');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(credsFile, JSON.stringify({ accepted: opts.accepted || [] }));
  fs.writeFileSync(logFile, '');

  const child = spawn(
    process.execPath,
    [AUTH_SERVER, '--root', root, '--creds', credsFile, '--log', logFile],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } }
  );
  installExitGuard();
  LIVE_REMOTES.add(child);
  child.once('exit', () => LIVE_REMOTES.delete(child));

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error(`git-auth-server não publicou a porta em 10s: ${stderr}`));
    }, 10000);

    function done() {
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onEarlyExit);
      child.removeListener('error', fail);
    }
    function fail(e) {
      if (settled) return;
      done();
      reject(e);
    }
    function onEarlyExit(code) {
      fail(new Error(`git-auth-server saiu com ${code}: ${stderr}`));
    }

    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', fail);
    child.on('exit', onEarlyExit);
    child.stdout.on('data', (c) => {
      if (settled) return;
      stdout += c.toString();
      const nl = stdout.indexOf('\n');
      if (nl === -1) return;
      let port;
      try {
        port = JSON.parse(stdout.slice(0, nl)).port;
      } catch {
        child.kill('SIGKILL');
        fail(new Error(`porta ilegível do git-auth-server: ${stdout}`));
        return;
      }
      done();
      resolve(makeRemoteHandle({ child, dir, root, credsFile, logFile, port }));
    });
  });
}

function makeRemoteHandle({ child, dir, root, credsFile, logFile, port }) {
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    port,
    baseURL,
    root,
    credsFile,
    logFile,
    // Troca as credenciais aceitas com o servidor no ar (AC-08).
    setAccepted(list) {
      fs.writeFileSync(credsFile, JSON.stringify({ accepted: list }));
    },
    // Headers `Authorization` dos GET info/refs que trouxeram credencial,
    // em ordem de chegada.
    authHeaders() {
      return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    },
    // Os segredos apresentados (a parte depois do `:` no Basic), em ordem.
    // É o que a tabela do AC-14 compara.
    presentedSecrets() {
      return this.authHeaders().map((h) => {
        const m = /^Basic\s+(\S+)$/i.exec(h);
        if (!m) return h;
        const decoded = Buffer.from(m[1], 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        return i === -1 ? decoded : decoded.slice(i + 1);
      });
    },
    presentedUsers() {
      return this.authHeaders().map((h) => {
        const m = /^Basic\s+(\S+)$/i.exec(h);
        if (!m) return '';
        const decoded = Buffer.from(m[1], 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        return i === -1 ? '' : decoded.slice(0, i);
      });
    },
    clearAuthLog() {
      fs.writeFileSync(logFile, '');
    },
    close() {
      return new Promise((resolve) => {
        const finish = () => { rmrf(dir); resolve(); };
        if (child.exitCode !== null || child.signalCode !== null) { finish(); return; }
        child.once('exit', finish);
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 2000).unref();
      });
    },
  };
}

// Publica no remoto um hub bare com a fixture + o `bin/ahc` deste repo
// (o install.sh copia o CLI de dentro do cache, então ele precisa existir lá).
function makeBareHub(remote, opts = {}) {
  const repo = opts.repo || DEFAULT_HUB_REPO;
  const branch = opts.branch || 'main';
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-hub-'));
  const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-githome-'));
  const env = isolatedGitEnv(gitHome);

  copyTree(FIXTURE_REMOTE, workDir);
  fs.mkdirSync(path.join(workDir, 'bin'), { recursive: true });
  fs.copyFileSync(AHC_BIN, path.join(workDir, 'bin', 'ahc'));
  fs.chmodSync(path.join(workDir, 'bin', 'ahc'), 0o755);
  fs.copyFileSync(INSTALL_SH, path.join(workDir, 'install.sh'));

  git(['init', '-q', '-b', branch, workDir], { env });
  git(['-C', workDir, 'add', '-A'], { env });
  git(['-C', workDir, 'commit', '-q', '-m', 'hub fixture'], { env });

  const barePath = path.join(remote.root, `${repo}.git`);
  fs.mkdirSync(path.dirname(barePath), { recursive: true });
  git(['clone', '--bare', '-q', workDir, barePath], { env });

  return {
    repo,
    branch,
    workDir,
    barePath,
    gitHome,
    url: `${remote.baseURL}/${repo}.git`,
    env,
    cleanup() { rmrf(workDir); rmrf(gitHome); },
  };
}

// Sobe a versão de um agent do manifest e publica o commit no bare.
// É o "hub recebeu uma versão nova" do AC-04 / AC-14.
function publishAgentVersion(hub, opts = {}) {
  const name = opts.name || 'test-agent';
  const version = opts.version || '1.1.0';
  const rel = `agents/${name}.md`;
  const file = path.join(hub.workDir, rel);
  const body = opts.body !== undefined
    ? opts.body
    : `${fs.readFileSync(file, 'utf8').trimEnd()}\n\nAtualizado para ${version} pelo harness de teste.\n`;
  fs.writeFileSync(file, body);

  const manifestPath = path.join(hub.workDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = (manifest.agents || []).find((a) => a.name === name);
  if (!entry) throw new Error(`manifest do hub não tem o agent ${name}`);
  entry.version = version;
  entry.sha256 = sha256(body);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  git(['-C', hub.workDir, 'add', '-A'], { env: hub.env });
  git(['-C', hub.workDir, 'commit', '-q', '-m', `publish ${name} ${version}`], { env: hub.env });
  git(['-C', hub.workDir, 'push', '-q', hub.barePath, `HEAD:refs/heads/${hub.branch}`], { env: hub.env });

  return { name, version, path: rel, sha256: entry.sha256, body };
}

// Condição de baseline (CB) do task.md: HOME e XDG temporários, sem credencial
// git de sistema, sem AHC_GITHUB_TOKEN e com GIT_TERMINAL_PROMPT **ausente**
// (o AC-14 exige que nada peça input mesmo sem a variável). O cwd neutro evita
// que o CLI enxergue o repo de trabalho do dev.
function baselineEnv(home, opts = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(GIT_|XDG_|AHC_)/.test(key)) delete env[key];
  }
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;

  const xdg = path.join(home, '.xdg');
  const cwd = path.join(home, '.cwd');
  for (const d of ['config', 'cache', 'data', 'state']) {
    fs.mkdirSync(path.join(xdg, d), { recursive: true });
  }
  fs.mkdirSync(cwd, { recursive: true });

  env.HOME = home;
  env.USERPROFILE = home;
  env.XDG_CONFIG_HOME = path.join(xdg, 'config');
  env.XDG_CACHE_HOME = path.join(xdg, 'cache');
  env.XDG_DATA_HOME = path.join(xdg, 'data');
  env.XDG_STATE_HOME = path.join(xdg, 'state');
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.LC_ALL = 'C';
  env.PWD = cwd;

  if (opts.baseURL) env.AHC_TEST_GIT_BASE_URL = opts.baseURL;
  if (opts.embeddedToken !== undefined) env.AHC_TEST_EMBEDDED_TOKEN = opts.embeddedToken;
  if (opts.envToken !== undefined) env.AHC_GITHUB_TOKEN = opts.envToken;
  Object.assign(env, opts.extra || {});
  return env;
}

// Instala o credential helper simulado (C_DEV) no HOME temporário.
function installCredHelper(home, opts = {}) {
  const env = isolatedGitEnv(home);
  git(['config', '--global', 'credential.helper', CRED_HELPER], { env });
  if (opts.username) git(['config', '--global', 'credential.username', opts.username], { env });
  return CRED_HELPER;
}

// Roda o install.sh real com a CB. Sem stdin: nada pode ficar esperando input.
function runInstall(home, opts = {}) {
  const env = opts.env || baselineEnv(home, opts);
  return spawnSync('bash', [INSTALL_SH, ...(opts.args || [])], {
    env: {
      ...env,
      AHC_BIN_DIR: opts.binDir || path.join(home, '.local', 'bin'),
      ...(opts.repo ? { AHC_REPO: opts.repo } : {}),
      ...(opts.branch ? { AHC_BRANCH: opts.branch } : {}),
    },
    cwd: opts.cwd || env.PWD || home,
    encoding: 'utf8',
    timeout: opts.timeout || 60000,
    input: opts.input !== undefined ? opts.input : '',
  });
}

module.exports = {
  REPO_ROOT,
  FIXTURE_REMOTE,
  AHC_BIN,
  INSTALL_SH,
  REGEN_SCRIPT,
  VALIDATOR,
  AUTH_SERVER,
  CRED_HELPER,
  DEFAULT_HUB_REPO,
  makeTmpHome,
  makeTmpRepo,
  makeMinimalRepo,
  copyTree,
  writeConfig,
  readLock,
  writeLock,
  sha256OfFile,
  runAhc,
  runRegen,
  runValidator,
  patchManifest,
  rmrf,
  sha256,
  git,
  isolatedGitEnv,
  startAuthRemote,
  makeBareHub,
  publishAgentVersion,
  baselineEnv,
  installCredHelper,
  runInstall,
};

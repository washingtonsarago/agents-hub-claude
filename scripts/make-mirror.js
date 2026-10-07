#!/usr/bin/env node
// make-mirror — transforma o hub canônico na cópia de distribuição externa.
//
// Por que existe:
//   O repo canônico é INTERNAL na EMS-NCTECH. Quem está fora da org (contractors,
//   parceiros, ambientes restritos) não consegue clonar nem sincronizar dele. O
//   espelho em outro owner é o canal pra essas pessoas — e não pode ser cópia
//   byte-a-byte, porque o installer, a CLI e o manifest precisam apontar pro
//   próprio espelho, senão o `ahc sync` do usuário externo tenta alcançar um repo
//   que ele não enxerga.
//
//   Esse delta já foi mantido na mão uma vez. O resultado: o espelho ficou um mês
//   defasado e o README saiu com frases quebradas ("O repo é INTERNAL na org ,"),
//   porque a substituição foi literal em cima do nome da org em vez de cirúrgica
//   nos slugs. Este script torna o delta determinístico.
//
// O que transforma (e só isso):
//   - Slug `<canonical>/agents-hub-claude` -> `<owner>/agents-hub-claude` nos
//     arquivos que dirigem instalação: install.sh, bin/ahc, README.md.
//   - Campo `repo` do manifest.json (JSON-aware, não string replace).
//   - Remove test/origin.test.js e .githooks/pre-push: ambos existem pra travar o
//     canônico num único owner, então no espelho um falharia e o outro bloquearia
//     o push.
//   - Ajusta no README a linha que descreve o teste removido.
//   - Insere um aviso no topo do README dizendo o que é essa cópia.
//   - Esvazia o valor do token embutido nos dois marcadores AHC-EMBEDDED-TOKEN
//     (install.sh e bin/ahc). O PAT é da org EMS-NCTECH e não pode sair dela numa
//     cópia manual; além disso ele só vale pro canônico, então no espelho seria
//     recusado em todo sync e geraria um ⚠ por sessão.
//   - Gera a cópia como commit órfão (--apply), sem o histórico do canônico:
//     esvaziar só a árvore não basta, porque o commit que gravou o valor viajaria
//     junto no histórico.
//
// O que NÃO transforma:
//   Menções em prosa a EMS-NCTECH ("usados pela engenharia da EMS-NCTECH", "o repo
//   é INTERNAL na org EMS-NCTECH"). São verdadeiras e informativas pro leitor
//   externo — foi justamente apagá-las que produziu as frases quebradas antes.
//   Referências ao repo canônico em docs/, autonomous/ e scripts/ também ficam:
//   apontam pro hub de verdade de propósito.
//
// Flags:
//   --owner=<login>   dono do espelho (obrigatório)
//   --apply           escreve as mudanças na working tree atual e, se for um repo
//                     git, reescreve o histórico como um único commit órfão
//   --check           só verifica se a tree JÁ está transformada (exit 1 se não) e
//                     se nenhum blob alcançável carrega segredo
//   (sem flag)        dry-run: lista o que mudaria
//
// Zero deps. Rode da raiz do repo (ou da raiz da cópia).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = process.cwd();
const CANONICAL = 'EMS-NCTECH';
const REPO_NAME = 'agents-hub-claude';

// Arquivos que fazem o `ahc` decidir de onde sincronizar. Se um slug escapar aqui,
// o usuário externo instala e passa a puxar de um repo que ele não acessa.
const SLUG_FILES = ['install.sh', 'bin/ahc', 'README.md'];

// Travas do canônico: sem sentido (e ativamente danosas) no espelho.
const DROP_FILES = ['test/origin.test.js', '.githooks/pre-push'];

// Arquivos que carregam o literal do token embutido (um marcador em cada).
const TOKEN_FILES = ['install.sh', 'bin/ahc'];

// Casa a linha marcada e captura o valor entre aspas simples. As duas formas são
// a atribuição do shell em install.sh (comentário `#`) e a do const em bin/ahc
// (comentário `//`); em ambas o marcador fecha a linha.
//
// A âncora no fim da linha é o que separa "linha do literal" de "linha que só cita
// o marcador" — regex de teste, prosa de doc e este próprio arquivo mencionam o
// nome do marcador e não podem ser confundidos com o segredo.
const MARKER_LINE_RE = /^(.*?=[ \t]*)'([^']*)'([ \t]*;?[ \t]*(?:\/\/|#)[ \t]*AHC-EMBEDDED-TOKEN[ \t]*)$/;

// Rede de segurança para um PAT fine-grained fora dos marcadores (README colado,
// doc, fixture esquecida). Montado por concatenação: escrito inteiro, este arquivo
// casaria o próprio padrão e acusaria segredo em toda cópia que o carregue.
//
// Piso 20, como o C12 exige. O corpo de um fine-grained real tem 82 caracteres,
// então o piso é folgado — a razão de ser baixo é pegar também token truncado ou
// colado pela metade. Exemplo de documentação não pode gastar o alarme: quem
// escrever um `github_pat_` seguido de 20+ alfanuméricos num comentário quebra o
// `--check`, e a saída é reescrever o exemplo com reticências (foi o que se fez
// em `bin/ahc`), nunca afrouxar o piso.
const SECRET_RE = new RegExp('github' + '_pat_' + '[A-Za-z0-9_]{20,}');

// Deixa o literal vazio ('') sem tocar em mais nada da linha.
function clearEmbeddedToken(text) {
  return text
    .split('\n')
    .map((line) => {
      const m = MARKER_LINE_RE.exec(line);
      if (!m || m[2] === '') return line;
      return `${m[1]}''${m[3]}`;
    })
    .join('\n');
}

// true se alguma linha marcada tiver valor. Nunca devolve nem imprime o valor.
function hasEmbeddedToken(text) {
  return text.split('\n').some((line) => {
    const m = MARKER_LINE_RE.exec(line);
    return Boolean(m) && m[2] !== '';
  });
}

const ARGS = process.argv.slice(2);
const OWNER = (ARGS.find((a) => a.startsWith('--owner=')) || '').split('=')[1];
const APPLY = ARGS.includes('--apply');
const CHECK = ARGS.includes('--check');

if (!OWNER) {
  console.error('uso: node scripts/make-mirror.js --owner=<login> [--apply|--check]');
  process.exit(2);
}
if (OWNER === CANONICAL) {
  console.error(`--owner não pode ser ${CANONICAL}: o espelho existe pra apontar pra outro dono`);
  process.exit(2);
}
if (APPLY && CHECK) {
  console.error('--apply e --check são mutuamente exclusivos');
  process.exit(2);
}

const slugRe = new RegExp(`${CANONICAL}/${REPO_NAME}`, 'g');

const BANNER = `> **Cópia de distribuição externa.** O hub canônico é [\`${CANONICAL}/${REPO_NAME}\`](https://github.com/${CANONICAL}/${REPO_NAME}) e é lá que se contribui — PRs abertos aqui não chegam nos devs da engenharia. Este espelho existe pra quem não tem acesso à org ${CANONICAL} conseguir instalar e sincronizar. Gerado por \`scripts/make-mirror.js\`; não edite à mão.`;

function read(rel) {
  const p = path.join(REPO_ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// --- git ---------------------------------------------------------------------
// GIT_DIR/GIT_WORK_TREE herdados venceriam o cwd e fariam `add -A`/`update-ref`
// agir no repo de quem chamou. Fora do env, sempre.
function gitEnv() {
  const env = { ...process.env, LC_ALL: 'C', LANGUAGE: 'C' };
  for (const k of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_COMMON_DIR', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ]) delete env[k];
  return env;
}

function git(args, opts = {}) {
  return spawnSync('git', args, {
    cwd: REPO_ROOT, encoding: 'utf8', env: gitEnv(), maxBuffer: 64 * 1024 * 1024, ...opts,
  });
}

function gitOut(args) {
  const r = git(args);
  return r.status === 0 ? r.stdout.trim() : null;
}

const isGitRepo = () => gitOut(['rev-parse', '--git-dir']) !== null;

// Ids de todo objeto alcançável a partir de qualquer ref e do HEAD. É o conjunto
// que viaja num push do espelho — o que não está aqui não sai daqui.
function reachableObjectIds() {
  const revs = ['--all'];
  if (gitOut(['rev-parse', '--verify', '--quiet', 'HEAD'])) revs.push('HEAD');
  const r = git(['rev-list', '--objects', ...revs]);
  if (r.status !== 0) throw new Error(`git rev-list falhou: ${(r.stderr || '').split('\n')[0]}`);
  const ids = new Map(); // oid -> caminho conhecido (commits saem sem caminho)
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const sp = line.indexOf(' ');
    const oid = sp === -1 ? line : line.slice(0, sp);
    if (/^[0-9a-f]{40,64}$/.test(oid) && !ids.has(oid)) ids.set(oid, sp === -1 ? '' : line.slice(sp + 1));
  }
  return ids;
}

// Lê os blobs em lote e devolve os achados. Reporta oid + caminho; nunca o valor.
function scanReachableHistory() {
  const ids = reachableObjectIds();
  if (!ids.size) return [];
  const all = [...ids.keys()];
  const findings = [];

  for (let i = 0; i < all.length; i += 512) {
    const chunk = all.slice(i, i + 512);
    const r = spawnSync('git', ['cat-file', '--batch'], {
      cwd: REPO_ROOT, env: gitEnv(), input: chunk.join('\n') + '\n', maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error(`git cat-file falhou: ${String(r.stderr || '').split('\n')[0]}`);
    const buf = r.stdout;

    let off = 0;
    while (off < buf.length) {
      const nl = buf.indexOf(0x0a, off);
      if (nl === -1) break;
      const [oid, type, sizeStr] = buf.slice(off, nl).toString('utf8').split(' ');
      if (type !== 'blob' && type !== 'commit' && type !== 'tree' && type !== 'tag') {
        // "<oid> missing": objeto fora do repo. Não há corpo pra pular.
        off = nl + 1;
        continue;
      }
      const size = Number(sizeStr);
      const body = buf.slice(nl + 1, nl + 1 + size);
      if (type === 'blob') {
        const text = body.toString('latin1');
        const where = `${oid.slice(0, 10)} ${ids.get(oid) || '(sem caminho)'}`;
        if (hasEmbeddedToken(text)) findings.push(`${where}: marcador AHC-EMBEDDED-TOKEN com valor`);
        else if (SECRET_RE.test(text)) findings.push(`${where}: padrão de PAT fine-grained`);
      }
      off = nl + 1 + size + 1; // corpo + \n de separação
    }
  }
  return findings;
}

// Identidade neutra quando o repo/ambiente não tem uma: o commit do espelho não
// precisa carregar o nome de quem rodou o script.
function commitEnv() {
  const env = gitEnv();
  if (gitOut(['var', 'GIT_COMMITTER_IDENT'])) return env;
  return {
    ...env,
    GIT_AUTHOR_NAME: 'make-mirror', GIT_AUTHOR_EMAIL: 'make-mirror@localhost',
    GIT_COMMITTER_NAME: 'make-mirror', GIT_COMMITTER_EMAIL: 'make-mirror@localhost',
  };
}

// Reescreve a cópia como um único commit sem pais e apaga todas as outras refs.
// Depois disso, `git log --all -p` mostra só a árvore do espelho: o commit que
// gravou o token no canônico deixa de ser alcançável e não é empacotado num push.
function makeOrphanCommit() {
  const fail = (msg) => { console.error(`[make-mirror] ${msg}`); process.exit(1); };

  if (git(['add', '-A']).status !== 0) fail('git add -A falhou');
  const tree = gitOut(['write-tree']);
  if (!tree) fail('git write-tree falhou');

  const branch = gitOut(['symbolic-ref', '--quiet', '--short', 'HEAD']) || 'main';
  const msg = `espelho de ${OWNER} — cópia de distribuição externa (commit órfão, sem histórico do canônico)`;
  const r = git(['commit-tree', tree, '-m', msg], { env: commitEnv() });
  if (r.status !== 0) fail(`git commit-tree falhou: ${(r.stderr || '').split('\n')[0]}`);
  const commit = r.stdout.trim();

  if (git(['update-ref', `refs/heads/${branch}`, commit]).status !== 0) fail('git update-ref falhou');
  if (git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]).status !== 0) fail('git symbolic-ref falhou');

  const keep = `refs/heads/${branch}`;
  const refs = (gitOut(['for-each-ref', '--format=%(refname)']) || '').split('\n').filter(Boolean);
  for (const ref of refs) if (ref !== keep) git(['update-ref', '-d', ref]);

  // Sem isso o commit antigo continua alcançável pelo reflog e os objetos com o
  // valor seguem no .git de quem receber o diretório.
  git(['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all']);
  git(['gc', '--prune=now', '--quiet']);

  return { commit, branch };
}

function transformSlugs(text) {
  return text.replace(slugRe, `${OWNER}/${REPO_NAME}`);
}

const BANNER_START = '> **Cópia de distribuição externa.';

// O aviso aponta de propósito pro repo canônico — é onde o leitor externo deve
// contribuir. Isso significa que ele carrega um slug canônico que o rewrite
// reescreveria na passada seguinte, corrompendo o próprio aviso. Por isso ele é
// removido antes de reescrever e reinserido depois: o transform fica idempotente
// e `--check` consegue afirmar "esta tree já é o espelho".
function stripBanner(text) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.startsWith(BANNER_START));
  if (i === -1) return text;
  const start = i > 0 && lines[i - 1].trim() === '' ? i - 1 : i;
  lines.splice(start, i - start + 1);
  return lines.join('\n');
}

function transformReadme(text) {
  let out = transformSlugs(stripBanner(text));

  // A linha que descreve origin.test.js fica mentindo depois que o arquivo sai.
  out = out
    .split('\n')
    .filter((line) => !/^- `origin\.test\.js`/.test(line))
    .join('\n');

  const lines = out.split('\n');
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  const at = h1 === -1 ? 0 : h1 + 1;
  lines.splice(at, 0, '', BANNER);
  return lines.join('\n');
}

function transformManifest(text) {
  const m = JSON.parse(text);
  m.repo = `${OWNER}/${REPO_NAME}`;
  return JSON.stringify(m, null, 2) + '\n';
}

// Monta a lista de mudanças sem tocar em disco.
function plan() {
  const changes = [];

  for (const rel of SLUG_FILES) {
    const cur = read(rel);
    if (cur === null) continue;
    let next = rel === 'README.md' ? transformReadme(cur) : transformSlugs(cur);
    const notes = [];
    const hits = (cur.match(slugRe) || []).length;
    if (hits) notes.push(`${hits} slug(s)`);
    if (TOKEN_FILES.includes(rel) && hasEmbeddedToken(next)) {
      next = clearEmbeddedToken(next);
      notes.push('token embutido com valor');
    }
    if (next !== cur) changes.push({ kind: 'rewrite', rel, next, note: notes.join(', ') });
  }

  const manifest = read('manifest.json');
  if (manifest !== null) {
    const next = transformManifest(manifest);
    if (next !== manifest) changes.push({ kind: 'rewrite', rel: 'manifest.json', next, note: 'campo repo' });
  }

  for (const rel of DROP_FILES) {
    if (fs.existsSync(path.join(REPO_ROOT, rel))) {
      changes.push({ kind: 'delete', rel, note: 'trava do canônico' });
    }
  }

  return changes;
}

const changes = plan();

if (CHECK) {
  let bad = false;

  if (changes.length) {
    bad = true;
    console.error(`[make-mirror] tree NÃO está transformada para ${OWNER}:`);
    for (const c of changes) console.error(`  ${c.kind === 'delete' ? '-' : '~'} ${c.rel} (${c.note})`);
  }

  // A árvore limpa não basta: o espelho sai de uma branch derivada, então um valor
  // gravado num commit anterior viajaria no histórico.
  if (isGitRepo()) {
    let findings;
    try {
      findings = scanReachableHistory();
    } catch (e) {
      console.error(`[make-mirror] não foi possível varrer o histórico: ${e.message}`);
      process.exit(1);
    }
    if (findings.length) {
      bad = true;
      console.error('[make-mirror] segredo no histórico alcançável (refs + HEAD):');
      for (const f of findings) console.error(`  ! ${f}`);
      console.error('  → rode `--apply`: a cópia sai como commit órfão, sem o histórico do canônico');
    }
  }

  if (bad) process.exit(1);
  console.log(`[make-mirror] tree já transformada para ${OWNER} e histórico sem segredo — ok`);
  process.exit(0);
}

if (!changes.length) {
  console.log(`[make-mirror] nada a fazer — tree já aponta para ${OWNER}`);
  if (APPLY && isGitRepo()) {
    const { commit, branch } = makeOrphanCommit();
    console.log(`[ok] histórico reescrito: commit órfão ${commit.slice(0, 10)} em ${branch}`);
  }
  process.exit(0);
}

for (const c of changes) {
  console.log(`  ${c.kind === 'delete' ? '-' : '~'} ${c.rel}  (${c.note})`);
}

if (!APPLY) {
  if (isGitRepo()) console.log('  ~ histórico  (vira um único commit órfão)');
  console.log(`\n[dry-run] ${changes.length} mudança(s) — rode com --apply pra escrever`);
  process.exit(0);
}

for (const c of changes) {
  const p = path.join(REPO_ROOT, c.rel);
  if (c.kind === 'delete') fs.rmSync(p, { force: true });
  else fs.writeFileSync(p, c.next);
}
console.log(`\n[ok] ${changes.length} mudança(s) aplicadas — espelho de ${OWNER}`);

if (isGitRepo()) {
  const { commit, branch } = makeOrphanCommit();
  console.log(`[ok] histórico reescrito: commit órfão ${commit.slice(0, 10)} em ${branch}`);
}

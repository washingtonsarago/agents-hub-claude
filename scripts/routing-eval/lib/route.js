'use strict';
// route — roda um caso: `claude -p` com só os agents do hub e devolve o
// subagent_type do 1º tool_use de Agent/Task. É o ÚNICO módulo do eval que
// abre processo, e por isso nenhum teste o importa: o que dá para provar sem
// modelo está em args.js, guard.js, evalset.js e report.js.
//
// O grupo de processos morre no 1º tool_use (o subagent nunca executa), no
// evento result, no timeout e se o init não passar no guard. Sem shell: argv
// em array. cwd é um diretório temporário vazio, apagado no fim. stderr do
// filho é descartado e o stream bruto nunca é gravado (C12).

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildArgs } = require('./args');
const { checkInit, routeFrom, costFrom } = require('./guard');

function route({ prompt, model, agentsJson, timeoutMs = 150000 }) {
  return new Promise(resolve => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-eval-'));
    let p;
    try {
      p = spawn('claude', buildArgs({ prompt, model, agentsJson }), { cwd, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    } catch {
      fs.rmSync(cwd, { recursive: true, force: true });
      return resolve({ got: 'ERR', cost: null });
    }
    let buf = '';
    let done = false;
    let initOk = false;
    const finish = r => {
      if (done) return;
      done = true;
      try { process.kill(-p.pid, 'SIGKILL'); } catch { /* já saiu */ }
      clearTimeout(timer);
      fs.rmSync(cwd, { recursive: true, force: true });
      resolve({ cost: null, ...r });
    };
    const timer = setTimeout(() => finish({ got: 'TIMEOUT' }), timeoutMs);
    p.on('error', () => finish({ got: 'ERR' }));
    p.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'system' && e.subtype === 'init') {
          const g = checkInit(e);
          if (!g.ok) return finish({ got: 'ENV_UNSAFE', reason: g.reason });
          initOk = true;
          continue;
        }
        const got = routeFrom(e);
        // tool_use antes de um init validado: fail-closed.
        if (got) return finish(initOk ? { got } : { got: 'ENV_UNSAFE', reason: 'tool_use before a validated init' });
        if (e.type === 'result') return finish({ got: 'NONE', cost: costFrom(e) });
      }
    });
    p.on('close', () => finish({ got: 'ERR' }));
  });
}

module.exports = { route };

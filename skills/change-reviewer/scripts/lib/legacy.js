'use strict';
// legacy — os nomes que o reviewer tinha antes do rename para change-reviewer.
//
// Por que existe: o `ahc sync` tira da máquina do dev o agent e a skill com o
// nome antigo, mas não alcança o que ele não instalou. Nos repos que adotaram
// o /flow-lite ficam o arquivo de perfil e o bloco cercado no CLAUDE.md; na
// home do dev ficam o diretório de estado (config, ack, opt-out de telemetria)
// e as variáveis de ambiente que ele pôs no shell. Rename puro nesses pontos
// trocaria o perfil do gate para `default` em silêncio e religaria telemetria
// contra um opt-out explícito. Então os nomes antigos seguem aceitos.
//
// Regra de precedência (task 004 §5.2): na configuração o nome novo vence por
// inteiro e o legado é só fallback; no opt-out qualquer fonte desliga e
// nenhuma religa.
//
// Todo literal antigo vive aqui, e toda linha que o cita diz "legacy": o grep
// de rename completo filtra por essa palavra, e remover a compatibilidade vira
// apagar este módulo e seus chamadores. Sai numa demanda futura, com dado de
// uso mostrando que ninguém depende mais dele.

module.exports = Object.freeze({
  LEGACY_NAME: 'emstech-reviewer', // legacy
  LEGACY_PROFILE_FILE: '.emstech-reviewer.json', // legacy: perfil commitado no repo alvo
  LEGACY_BLOCK_TAG: 'emstech-reviewer', // legacy: tag do bloco cercado no CLAUDE.md
  LEGACY_STATE_DIR: '.emstech-reviewer', // legacy: diretório de estado sob ~/.claude
  LEGACY_ENV_HOME: 'EMSTECH_REVIEWER_HOME', // legacy: override do diretório de estado
  LEGACY_ENV_TELEMETRY: 'EMSTECH_TELEMETRY', // legacy: opt-out por env (=off)
  LEGACY_ENV_ENDPOINT: 'EMSTECH_TELEMETRY_ENDPOINT', // legacy: endpoint por env
  LEGACY_ENV_SYNC: 'EMSTECH_TELEMETRY_SYNC', // legacy: envio síncrono (=1)
});

// Tudo que o MultiIdle sabe "por dentro" do PokeIdle: endereço, ids da página, chaves do localStorage
// e limites de estoque. Se o jogo mudar, é aqui que ajusta (os eventos de batalha ficam no alertas.js).
// Conferido com o jogo v1.398.1.
const GAME_URL = 'https://pokeidle.io/app';
const GAME_HOST = 'pokeidle.io';

// avisos que o jogo mostra na página (o vigia do main.js lê estes ids)
const IDS = { sessaoTomada: 'sessao-tomada', alertaConta: 'alerta-conta', avisoVersao: 'aviso-versao', avisoVersaoBtn: 'aviso-versao-btn' };
// localStorage do jogo: sessão salva (entra sozinho) e Modo Economia
const LS = { sessao: 'sessao', economia: 'cfg-economia' };

// abaixo disso o recurso conta como "acabando" (alerta no PC, vermelho no celular)
const LIMITES = { bolas: 50, pocoes: 20, revives: 5 };

// ---- detector de "o jogo mudou" ----
// O MultiIdle entende o jogo pelo texto das mensagens do WebSocket. Se o formato mudar, os alertas
// param EM SILÊNCIO. Sinais de que isso aconteceu:
//   - chegam mensagens, mas nenhuma é o 'welcome' (a conta nunca "entra" pro MultiIdle);
//   - a conta está caçando e chegam mensagens, mas nenhuma de estado/batalha por muito tempo;
//   - algum dos ids acima sumiu da página.
const MIN = 60 * 1000;
const SEM_WELCOME_MS = 3 * MIN;
const SEM_ESTADO_MS = 15 * MIN;
const QUADROS_SEM_WELCOME = 30; // na tela de login não chega quase nada; 30 mensagens sem welcome = mudou

// s: { logado, cacando, quadros (desde a última navegação), desde, ultimaMsg, ultimoReconhecido, agora }
function protocoloMudou(s) {
  if (!s.logado) {
    return s.quadros >= QUADROS_SEM_WELCOME && s.agora - s.desde > SEM_WELCOME_MS
      ? 'chegam mensagens do jogo, mas nenhuma de login reconhecida' : null;
  }
  if (s.cacando && s.agora - s.ultimaMsg < MIN && s.agora - s.ultimoReconhecido > SEM_ESTADO_MS) {
    return 'a conta está caçando, mas há 15 min nenhuma mensagem de batalha/estado é reconhecida';
  }
  return null;
}

module.exports = { GAME_URL, GAME_HOST, IDS, LS, LIMITES, protocoloMudou };

if (require.main === module) {
  const assert = require('assert');
  const base = { logado: true, cacando: true, quadros: 0, desde: 0, ultimaMsg: 20 * MIN, ultimoReconhecido: 0, agora: 20 * MIN };
  assert.ok(protocoloMudou(base)); // caçando, mensagens chegando, 20 min sem estado
  assert.equal(protocoloMudou({ ...base, ultimoReconhecido: 10 * MIN }), null); // estado há 10 min: ok
  assert.equal(protocoloMudou({ ...base, cacando: false }), null); // parada no centro/casa: pode não ter estado
  assert.equal(protocoloMudou({ ...base, ultimaMsg: 0 }), null); // nada chegando: é o vigia de travada que cuida
  const fora = { ...base, logado: false, agora: 4 * MIN };
  assert.equal(protocoloMudou(fora), null); // tela de login, sem mensagens
  assert.ok(protocoloMudou({ ...fora, quadros: 40 })); // mensagens chegando e nenhum welcome
  assert.equal(protocoloMudou({ ...fora, quadros: 40, agora: 2 * MIN }), null); // ainda carregando
  console.log('ok');
}

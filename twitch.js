// Bônus Twitch do PokeIdle — regra de 04/11/2026: igual à Kick. Quem assiste na PÁGINA do canal (ou no app)
// com o vídeo rodando ganha os pontos do canal da própria Twitch e resgata com eles horas de +15% (XP, Capture
// Boost ou Secret Lure). Antes era automático pelo chat; isso acabou (contava gente no chat sem view).
//
// O bloco `twitch` que o jogo manda no estado de cada conta:
//   { vinculado, login, pct, minutos (por resgate), pacotes: [3,5,10],
//     recompensas: [{ tipo, custo }],                 // tipo: 'xp' | 'captura' | 'shiny'
//     bonus: { xp: <ms em que acaba>, captura: ..., shiny: ... },
//     oficiais: [{ login, nome, aoVivo, espectadores, ativo }],  // ativo = o resgate funciona no canal
//     streamer: { login, nome, ativo } }             // só pra quem vinculou a conta de um streamer oficial

const NOMES_BONUS = { xp: 'XP', captura: 'Capture Boost', shiny: 'Secret Lure' };

const vinculada = (tw) => !!tw && !!(tw.vinculado ?? tw.login);

// Lives oficiais no ar em que dá pra resgatar (o streamer autorizou e as recompensas existem)
const livesComPontos = (tw) => (tw?.oficiais ?? []).filter((c) => c.aoVivo && c.ativo);

// Bônus valendo agora: [{ tipo, nome, falta (ms) }], o que acaba primeiro antes
function bonusAtivos(tw, agora = Date.now()) {
  return Object.entries(tw?.bonus ?? {})
    .map(([tipo, ate]) => ({ tipo, nome: NOMES_BONUS[tipo] ?? tipo, falta: Number(ate) - agora }))
    .filter((b) => b.falta > 0)
    .sort((a, b) => a.falta - b.falta);
}

// Quais bônus acabaram desde a última olhada. `visto` (tipo -> fim) é a memória entre chamadas e é atualizado aqui.
function bonusQueAcabaram(visto, tw, agora = Date.now()) {
  const acabaram = [];
  for (const [tipo, ate] of Object.entries(tw?.bonus ?? {})) if (Number(ate) > agora) visto[tipo] = Number(ate);
  for (const [tipo, ate] of Object.entries(visto)) {
    if (agora >= ate) { acabaram.push(NOMES_BONUS[tipo] ?? tipo); delete visto[tipo]; }
  }
  return acabaram;
}

function tempoCurto(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  return h ? `${h}h${min % 60 ? ` ${min % 60}min` : ''}` : `${min}min`;
}

module.exports = { NOMES_BONUS, vinculada, livesComPontos, bonusAtivos, bonusQueAcabaram, tempoCurto };

if (require.main === module) {
  const assert = require('assert');
  const agora = 1_000_000_000;
  const tw = {
    vinculado: true, login: 'ash_tv', pct: 15,
    bonus: { xp: agora + 42 * 60000, captura: agora - 1000, shiny: agora + 70 * 60000 },
    oficiais: [{ login: 'pato', aoVivo: true, ativo: true }, { login: 'axt', aoVivo: true, ativo: false }, { login: 'clo', aoVivo: false, ativo: true }],
  };
  assert.deepEqual(livesComPontos(tw).map((c) => c.login), ['pato']);
  assert.deepEqual(bonusAtivos(tw, agora).map((b) => b.tipo), ['xp', 'shiny']); // captura já acabou; o que acaba antes primeiro
  assert.equal(vinculada(tw), true);
  assert.equal(vinculada({ vinculado: false }), false);
  assert.equal(vinculada({ login: 'x' }), true); // servidor que só manda login
  assert.equal(vinculada(null), false);
  const visto = {};
  assert.deepEqual(bonusQueAcabaram(visto, tw, agora), []); // a captura já tinha acabado antes de a gente ver: não avisa
  assert.deepEqual(bonusQueAcabaram(visto, tw, agora + 43 * 60000), ['XP']); // o XP acabou agora
  assert.deepEqual(bonusQueAcabaram(visto, tw, agora + 44 * 60000), []); // não repete
  assert.equal(tempoCurto(42 * 60000), '42min');
  assert.equal(tempoCurto(70 * 60000), '1h 10min');
  assert.equal(tempoCurto(120 * 60000), '2h');
  assert.deepEqual(livesComPontos({ lives: [{ login: 'x' }] }), []); // formato antigo não quebra
  console.log('ok');
}

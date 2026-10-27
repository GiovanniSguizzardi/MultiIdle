// Retry de conta presa carregando (ex.: depois de um deploy/hotfix do jogo a página fica no loading
// ou reconectando sem fim). Só vale pra conta que TEM sessão salva (o jogo entra sozinho) ou cuja
// página falhou ao carregar; a tela de login de quem saiu da conta fica quieta.
const MIN = Number(process.env.MULTIIDLE_MIN_MS) || 60 * 1000; // MULTIIDLE_MIN_MS só pros testes encurtarem o minuto
const ESPERAS = [2 * MIN, 3 * MIN, 5 * MIN, 10 * MIN]; // depois da última, repete a cada 10 min
const LIMPAR_CACHE_A_PARTIR = 2; // a partir da 3ª tentativa (índice 2) limpa o cache da conta antes

// s: { logado, desde (ms da última navegação), temSessao, falhou, tentativas, agora }
function decidirRetry(s) {
  if (s.logado || !(s.temSessao || s.falhou)) return null;
  const espera = ESPERAS[Math.min(s.tentativas, ESPERAS.length - 1)];
  if (s.agora - s.desde < espera) return null;
  return { limparCache: s.tentativas >= LIMPAR_CACHE_A_PARTIR, tentativa: s.tentativas + 1 };
}

module.exports = { decidirRetry, ESPERAS };

if (require.main === module) {
  const assert = require('assert');
  const base = { logado: false, desde: 0, temSessao: true, falhou: false, tentativas: 0 };
  assert.equal(decidirRetry({ ...base, agora: MIN }), null); // 1 min: ainda espera
  assert.deepEqual(decidirRetry({ ...base, agora: 2 * MIN }), { limparCache: false, tentativa: 1 });
  assert.equal(decidirRetry({ ...base, tentativas: 1, agora: 2 * MIN }), null); // 2ª espera 3 min
  assert.deepEqual(decidirRetry({ ...base, tentativas: 2, agora: 5 * MIN }), { limparCache: true, tentativa: 3 });
  assert.equal(decidirRetry({ ...base, tentativas: 9, agora: 9 * MIN }), null); // teto de 10 min
  assert.ok(decidirRetry({ ...base, tentativas: 9, agora: 10 * MIN }));
  assert.equal(decidirRetry({ ...base, logado: true, agora: 99 * MIN }), null); // entrou: nada a fazer
  assert.equal(decidirRetry({ ...base, temSessao: false, agora: 99 * MIN }), null); // tela de login de quem saiu
  assert.ok(decidirRetry({ ...base, temSessao: false, falhou: true, agora: 2 * MIN })); // página nem carregou
  console.log('ok');
}

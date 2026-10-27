// Estado da conta pro painel do celular. O servidor do jogo manda o quadro completo no 'welcome'
// e depois só o que mudou ('estado'); a remontagem abaixo é a mesma do shared/estado-delta.mjs do jogo.
function criarMesclador() {
  let campos = null;
  let pokemons = new Map();
  return function mesclar(parcial) {
    if (!parcial) return campos ? montar() : null;
    const { cheio, pokemons: lista, pkMud, pkFora, dexMud, dexFora, ...resto } = parcial;
    if (cheio || !campos) {
      campos = resto;
      pokemons = new Map((lista ?? []).map((k) => [k.id, k]));
      return montar();
    }
    Object.assign(campos, resto);
    if (lista) pokemons = new Map(lista.map((k) => [k.id, k]));
    for (const k of pkMud ?? []) pokemons.set(k.id, k);
    for (const id of pkFora ?? []) pokemons.delete(id);
    return montar();
  };
  function montar() {
    return { ...campos, pokemons: [...pokemons.values()] };
  }
}

const n = (v) => Number(v) || 0;

// ctx: nomes que vêm no welcome — hunts (slug → nome) e bolas (id → nome)
function resumir(eu, ctx) {
  if (!eu) return null;
  const faixa = Math.max(1, n(eu.xpProximo) - n(eu.xpNivel));
  const dentro = Math.max(0, n(eu.xp) - n(eu.xpNivel));
  const local = eu.boss?.arena ? '⚔️ Arena de boss'
    : eu.mistico ? '🔮 Arena Mística'
    : eu.safari?.dentro ? '🌿 Safari'
    : eu.casa?.dentro ? '🏠 Casa'
    : eu.noCentro ? '🏥 Centro Pokémon'
    : eu.huntSlug ? `🗺️ ${ctx.hunts[eu.huntSlug] ?? eu.huntSlug}`
    : '🧭 Escolhendo mapa';
  const equipe = (eu.pokemons ?? []).filter((p) => p.slot != null).sort((a, b) => a.slot - b.slot)
    .map((p) => ({ nome: p.nome, level: n(p.level), hp: n(p.hp), maxHp: n(p.maxHp), shiny: !!p.shiny, ativo: p.id === eu.activeId }));
  const bolas = Object.entries(eu.balls ?? {}).filter(([, q]) => n(q) > 0)
    .map(([id, q]) => ({ nome: ctx.bolas[id] ?? `Ball #${id}`, qtd: n(q) }))
    .sort((a, b) => b.qtd - a.qtd);
  return {
    level: n(eu.level), xpPct: Math.min(100, (dentro / faixa) * 100), xpDentro: dentro, xpFaixa: faixa,
    gold: n(eu.gold), diamonds: n(eu.diamonds), orbs: n(eu.orbs), local, equipe, bolas,
    totalBolas: bolas.reduce((s, b) => s + b.qtd, 0), colecao: (eu.pokemons ?? []).length,
  };
}

module.exports = { criarMesclador, resumir };

if (require.main === module) {
  const assert = require('assert');
  const m = criarMesclador();
  m({ cheio: true, level: 10, xp: 150, xpNivel: 100, xpProximo: 200, gold: 5, huntSlug: 'rota-1', activeId: 2, balls: { 1: 30, 2: 0 },
    pokemons: [{ id: 1, nome: 'Rattata', level: 3 }, { id: 2, nome: 'Pikachu', level: 9, hp: 20, maxHp: 40, slot: 0 }] });
  const eu = m({ gold: 50, pkMud: [{ id: 3, nome: 'Pidgey', level: 4, hp: 10, maxHp: 10, slot: 1 }], pkFora: [1] });
  const r = resumir(eu, { hunts: { 'rota-1': 'Rota 1' }, bolas: { 1: 'Poké Ball' } });
  assert.equal(r.gold, 50);
  assert.equal(r.xpPct, 50);
  assert.equal(r.local, '🗺️ Rota 1');
  assert.deepEqual(r.equipe.map((p) => [p.nome, p.ativo]), [['Pikachu', true], ['Pidgey', false]]);
  assert.deepEqual(r.bolas, [{ nome: 'Poké Ball', qtd: 30 }]);
  assert.equal(r.colecao, 2);
  assert.equal(resumir(m({ noCentro: true }), { hunts: {}, bolas: {} }).local, '🏥 Centro Pokémon');
  console.log('ok');
}

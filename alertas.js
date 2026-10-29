// Traduz um evento de batalha do pokeidle (mensagem {t:'batalha', ev:[...]} do WebSocket) em alerta.
// Formato dos eventos tirado do app.js do jogo (função aoEvento) — se o jogo mudar, é aqui que ajusta.
const TIPOS = {
  shinyCap: '✨ Shiny capturado',
  shinyVisto: '✨ Shiny visto',
  captura: 'Pokémon capturado',
  desmaiou: '💀 Pokémon desmaiou',
  fugiu: 'Pokémon fugiu',
  boss: 'Boss derrotado',
  travou: '⚠️ Travou (recarregado)',
  atualizou: '🔄 Jogo atualizado (recarregado)',
  poucasBolas: '🔴 Pokébolas acabando',
  vendido: '💰 Item vendido no Market',
  preco: '💸 Preço bom no Mercado',
};

// placar da sessão de cada conta (desde que o app abriu ou desde o último "zerar")
const placarNovo = () => ({ inicio: Date.now(), capturas: 0, shinies: 0, abates: 0, desmaios: 0, xp: 0, gold: 0, drops: {}, ultimas: [] });
const num = (v) => Number(v) || 0;
function somarDrops(s, drops) {
  for (const d of drops ?? []) if (d?.nome) s.drops[d.nome] = (s.drops[d.nome] ?? 0) + (num(d.qtd) || 1);
}
function contar(s, e) {
  if (e.k === 'capturado') {
    s.capturas++;
    if (e.pokemon?.shiny) s.shinies++;
    s.ultimas.unshift({ nome: e.pokemon?.nome, level: num(e.pokemon?.level), shiny: !!e.pokemon?.shiny, em: Date.now() });
    s.ultimas.length = Math.min(s.ultimas.length, 15);
    return true;
  }
  if (e.k === 'morte') {
    if (e.quem !== 'selvagem') { s.desmaios++; return true; }
    s.abates++;
    s.xp += num(e.xpTreinador ?? e.xp);
    s.gold += num(e.ouro) + num(e.ouroVendaAuto);
    somarDrops(s, e.drops);
    return true;
  }
  if (e.k === 'bossMorto') {
    s.xp += num(e.xpTreinador ?? e.xp);
    s.gold += num(e.valor);
    somarDrops(s, e.drops);
    return true;
  }
  return false;
}

function eventoParaAlerta(e) {
  const p = e.pokemon;
  switch (e.k) {
    case 'capturado':
      return p.shiny ? ['shinyCap', `${p.nome} Nv ${p.level}`] : ['captura', `${p.nome} Nv ${p.level}`];
    case 'bola':
      return e.shiny ? ['shinyVisto', e.nome ?? ''] : null;
    case 'morte':
      return e.quem === 'selvagem' ? null : ['desmaiou', e.nome ?? ''];
    case 'fugiu':
      return ['fugiu', `${e.nome} Nv ${e.level}`];
    case 'bossMorto':
      return ['boss', e.nome ?? ''];
    // anúncio seu vendido (se foi com a conta offline, o jogo avisa quando ela entra)
    case 'marketVendido':
      return ['vendido', `${e.descricao ?? 'item'} por ${(Number(e.valor) || 0).toLocaleString('pt-BR')} ${e.moeda === 'orb' ? 'orbs' : 'coins'}`];
  }
  return null;
}

module.exports = { TIPOS, eventoParaAlerta, placarNovo, contar };

if (require.main === module) {
  const assert = require('assert');
  assert.deepEqual(eventoParaAlerta({ k: 'capturado', pokemon: { nome: 'Pikachu', level: 5, shiny: true } }), ['shinyCap', 'Pikachu Nv 5']);
  assert.deepEqual(eventoParaAlerta({ k: 'capturado', pokemon: { nome: 'Rattata', level: 3 } }), ['captura', 'Rattata Nv 3']);
  assert.equal(eventoParaAlerta({ k: 'bola', shiny: false }), null);
  assert.equal(eventoParaAlerta({ k: 'bola', shiny: true })[0], 'shinyVisto');
  assert.equal(eventoParaAlerta({ k: 'morte', quem: 'selvagem' }), null);
  assert.equal(eventoParaAlerta({ k: 'morte', quem: 'jogador' })[0], 'desmaiou');
  assert.equal(eventoParaAlerta({ k: 'ataque' }), null);
  assert.deepEqual(eventoParaAlerta({ k: 'marketVendido', descricao: 'Charizard Nv 50', valor: 15000, moeda: 'gold' }), ['vendido', 'Charizard Nv 50 por 15.000 coins']);
  assert.deepEqual(eventoParaAlerta({ k: 'marketVendido', descricao: 'Pena', valor: 3, moeda: 'orb' }), ['vendido', 'Pena por 3 orbs']);
  assert.equal(eventoParaAlerta({ k: 'venda', nome: 'Pena', ganho: 10 }), null); // venda pra loja NPC não é anúncio
  const s = placarNovo();
  contar(s, { k: 'capturado', pokemon: { nome: 'Pikachu', level: 5, shiny: true } });
  contar(s, { k: 'capturado', pokemon: { nome: 'Rattata', level: 2 } });
  contar(s, { k: 'morte', quem: 'selvagem', xpTreinador: 10, ouro: 3, ouroVendaAuto: 2, drops: [{ nome: 'Pena', qtd: 2 }] });
  contar(s, { k: 'morte', quem: 'jogador' });
  contar(s, { k: 'bossMorto', xp: 100, valor: 50, drops: [{ nome: 'Pena', qtd: 1 }] });
  assert.equal(contar(s, { k: 'ataque' }), false);
  const { inicio, ultimas, ...resto } = s;
  assert.deepEqual(resto, { capturas: 2, shinies: 1, abates: 1, desmaios: 1, xp: 110, gold: 55, drops: { Pena: 3 } });
  assert.deepEqual(ultimas.map((u) => u.nome), ['Rattata', 'Pikachu']);
  console.log('ok');
}

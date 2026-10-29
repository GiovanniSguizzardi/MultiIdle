// Aviso de preço bom no Mercado. Só AVISA: a compra é de quem usa, pelo próprio jogo (onde os primeiros
// 3 s de um anúncio novo viram sorteio entre quem pediu — o MultiIdle não compra nada sozinho).
//
// Oferta = { tipo: 'item'|'pokemon', itemId, nome, preco (por unidade), moeda: 'gold'|'orb', qtd, shiny, level }
//   - vem do alto-falante do Mercado no chat (m.anuncioChat), ao vivo
//   - ou do resumo da vitrine de itens (menor preço por item), quando alguém abre o Mercado
// Regra = { id, tipo: 'item'|'pokemon', alvo: itemId (item) | nome da espécie (pokemon) | '*' (qualquer item),
//           moeda: 'gold'|'orb', max?: preço máximo por unidade, pctMedia?: abaixo de N% da média de 7 dias,
//           soShiny?: bool (pokemon) }
// Médias = { [itemId]: { gold: { media, unidades }, orb: {...} } } — o 'medias' que o jogo manda na vitrine.

const norm = (s) => String(s ?? '').trim().toLowerCase();

function avaliar(oferta, regras, medias = {}) {
  const preco = Number(oferta.preco);
  if (!(preco > 0)) return null;
  for (const r of regras) {
    if (r.tipo !== oferta.tipo || r.moeda !== oferta.moeda) continue;
    if (r.tipo === 'item' && r.alvo !== '*' && Number(r.alvo) !== Number(oferta.itemId)) continue;
    if (r.tipo === 'pokemon' && norm(r.alvo) !== norm(oferta.nome)) continue;
    if (r.soShiny && !oferta.shiny) continue;
    if (r.max != null && preco <= Number(r.max)) return { regra: r, motivo: `até ${Number(r.max).toLocaleString('pt-BR')}` };
    if (r.pctMedia != null && r.tipo === 'item') {
      const m = medias[oferta.itemId]?.[oferta.moeda]?.media;
      if (m > 0 && preco <= m * (Number(r.pctMedia) / 100)) {
        return { regra: r, motivo: `${Math.round((preco / m) * 100)}% da média (${Math.round(m)})` };
      }
    }
  }
  return null;
}

// Converte o alto-falante do chat em oferta (ou null se não for anúncio de item/pokemon)
function ofertaDoChat(a) {
  if (!a || !['item', 'pokemon'].includes(a.tipo ?? 'item')) return null;
  return { id: a.id, tipo: a.tipo ?? 'item', itemId: a.itemId, nome: a.nome, preco: a.preco, moeda: a.moeda === 'orb' ? 'orb' : 'gold',
    qtd: a.qtd, shiny: !!a.shiny, level: a.level };
}

// O resumo da vitrine vira uma oferta por item e moeda (o menor preço anunciado agora)
function ofertasDoResumo(resumo, nomes = {}) {
  const lista = [];
  for (const [itemId, r] of Object.entries(resumo ?? {})) {
    if (!r?.anuncios) continue;
    if (r.minGold != null) lista.push({ tipo: 'item', itemId: Number(itemId), nome: nomes[itemId], preco: r.minGold, moeda: 'gold', resumo: true });
    if (r.minOrb != null) lista.push({ tipo: 'item', itemId: Number(itemId), nome: nomes[itemId], preco: r.minOrb, moeda: 'orb', resumo: true });
  }
  return lista;
}

function textoDaOferta(o, nomes = {}) {
  const nome = o.tipo === 'pokemon'
    ? `${o.shiny ? '✨ ' : ''}${o.nome ?? 'Pokémon'}${o.level ? ` Nv ${o.level}` : ''}`
    : (nomes[o.itemId] ?? o.nome ?? `item #${o.itemId}`);
  const moeda = o.moeda === 'orb' ? 'orbs' : 'coins';
  const qtd = o.qtd > 1 ? `${o.qtd}× ` : '';
  return `${qtd}${nome} por ${Number(o.preco).toLocaleString('pt-BR')} ${moeda}${o.qtd > 1 ? ' cada' : ''}`;
}

module.exports = { avaliar, ofertaDoChat, ofertasDoResumo, textoDaOferta };

if (require.main === module) {
  const assert = require('assert');
  const medias = { 81: { gold: { media: 1000, unidades: 50 }, orb: { media: 10 } } };
  const pedra = { tipo: 'item', itemId: 81, nome: 'Fire Stone', preco: 600, moeda: 'gold', qtd: 2 };
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: 81, moeda: 'gold', max: 500 }], medias), null); // 600 > 500
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: 81, moeda: 'gold', max: 600 }], medias).motivo, 'até 600');
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: 81, moeda: 'orb', max: 9999 }], medias), null); // outra moeda
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: 99, moeda: 'gold', max: 9999 }], medias), null); // outro item
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: 81, moeda: 'gold', pctMedia: 50 }], medias), null); // 60% > 50%
  assert.equal(avaliar(pedra, [{ tipo: 'item', alvo: '*', moeda: 'gold', pctMedia: 70 }], medias).motivo, '60% da média (1000)');
  assert.equal(avaliar({ ...pedra, itemId: 5 }, [{ tipo: 'item', alvo: '*', moeda: 'gold', pctMedia: 70 }], medias), null); // sem média conhecida
  const pika = { tipo: 'pokemon', nome: 'Pikachu', preco: 9000, moeda: 'gold', shiny: false };
  assert.ok(avaliar(pika, [{ tipo: 'pokemon', alvo: 'pikachu', moeda: 'gold', max: 10000 }]));
  assert.equal(avaliar(pika, [{ tipo: 'pokemon', alvo: 'Pikachu', moeda: 'gold', max: 10000, soShiny: true }]), null);
  assert.equal(avaliar({ ...pedra, preco: 0 }, [{ tipo: 'item', alvo: '*', moeda: 'gold', max: 10 }]), null); // preço inválido
  assert.deepEqual(ofertaDoChat({ id: 7, tipo: 'diamante', preco: 1 }), null);
  assert.equal(ofertaDoChat({ id: 7, itemId: 81, nome: 'Fire Stone', preco: 20, moeda: 'orb', qtd: 100 }).moeda, 'orb');
  assert.equal(ofertasDoResumo({ 81: { anuncios: 3, minGold: 700, minOrb: 9 }, 82: { anuncios: 0, minGold: 1 } }).length, 2);
  assert.equal(textoDaOferta({ ...pedra }, { 81: 'Pedra de Fogo' }), '2× Pedra de Fogo por 600 coins cada');
  assert.equal(textoDaOferta({ ...pika, shiny: true, level: 30 }), '✨ Pikachu Nv 30 por 9.000 coins');
  console.log('ok');
}

// HUNT — o motor que simula o pokémon em campo em cada hunt e diz onde ele ganha mais XP por hora.
//
// Baseado no motor da extensão "/hunt for PokeIdle", de Liang, usado com autorização dele, e
// adaptado ao MultiIdle:
//   - roda DENTRO da página do jogo de cada conta (o main.js injeta este arquivo), então importa as
//     fórmulas do próprio pokeidle.io ao vivo (`shared/*.mjs`, `hunt-analyser.mjs`) e os catálogos de
//     espécies: quando o jogo muda um número, o HUNT muda junto no próximo carregamento;
//   - o estado da conta, as hunts e as constantes do servidor vêm do main.js (que já escuta o WebSocket);
//   - o bônus de XP é o que o SERVIDOR manda pronto (`eu.bonusXp`, o mesmo número que o abate paga:
//     VIP, boosts, guild, Twitch, Kick, raid, sacrifício, evento...), e não uma reconstrução;
//   - só XP: o ouro saiu da conta;
//   - a simulação (que não depende dos bônus) fica guardada por pokémon/nível; a luta contra cada
//     espécie é memorizada entre hunts que repetem espécie e nível; e a conta anda em blocos, soltando
//     a página entre eles, para o jogo não engasgar.
//
// Regras de combate: Pokepédia do jogo (Combate e Stats). O que o cliente não tem e foi medido em
// jogo (o tempo por abate de cada mapa) vem da tabela de ritmo (ritmo-mapas.json, também do Liang).
// AoE e TM Elemental não entram na conta (decisão dele: estimar os discos trazia mais erro que acerto).
(() => {
  'use strict';
  if (window.__miHunt) return;

  // ---- o que vem do jogo -------------------------------------------------------------------------
  const MODULOS = {
    cooldown: 'shared/cooldown-golpes.mjs',
    especiais: 'shared/golpes-especiais.mjs',
    planilhas: 'shared/golpes-planilhas.mjs',
    outland: 'shared/outland.mjs',
    baseOutland: 'shared/herdar-base-outland.mjs',
    golpesOrre: 'shared/herdar-golpes-orre.mjs',
    megas: 'shared/megas.mjs',
    evolucoes: 'shared/evolucoes-cruzadas.mjs',
    recompensa: 'shared/recompensa-hunt.mjs',
    ajustes: 'shared/ajustes-especie-espelho.mjs',
    analyser: 'hunt-analyser.mjs',
    ginasios: 'shared/ginasios.mjs', // pódio dos ginásios: +25/10/5% de dano com pokémon do tipo
    sazonal: 'shared/dia-sazonal.mjs', // dia sazonal: a tipagem do dia fica 2× mais forte
  };
  const OPCIONAIS = new Set(['ajustes', 'ginasios', 'sazonal']);
  const CATALOGOS = {
    cr: 'assets/creatures.json',
    novos: 'assets/creatures-novos.json',
    outlandNovos: 'assets/creatures-outland-novos.json',
    formas: 'assets/creatures-formas.json',
    overrides: 'assets/creatures-audit-overrides.json',
  };
  const versaoDoJogo = () => document.querySelector('link[href*="estilo.css?v="]')?.getAttribute('href')?.split('v=')[1] ?? null;
  const url = (rel) => `${location.origin}/${rel}${versaoDoJogo() ? `?v=${versaoDoJogo()}` : ''}`;

  /** O catálogo de espécies como o cliente monta: só os passos que mexem em combate (stats, tipos, golpes). */
  function montarCatalogo(mod, { cr, novos, outlandNovos, formas, overrides }) {
    const lista = [...(cr?.creatures ?? [])];
    for (const f of [novos, outlandNovos, formas]) if (f?.creatures?.length) lista.push(...f.creatures);
    mod.outland.aplicarRemapOutlandLista(lista);
    const porId = new Map(lista.map((c) => [c.pokeId, c]));
    for (const o of overrides?.overrides ?? []) {
      const c = porId.get(o.pokeId);
      if (!c) continue;
      for (const k of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) if (typeof o[k] === 'number') c[k] = o[k];
      if (Array.isArray(o.attacks)) c.attacks = o.attacks.map((a) => ({ ...a }));
    }
    mod.planilhas.aplicarGolpesDasPlanilhas((id) => lista.filter((c) => c.pokeId === id));
    mod.baseOutland.herdarBaseOutland(lista);
    // cadeias truncadas antes dos golpes de 600: tira o ultimate de quem deixou de ser última evolução
    mod.evolucoes.aplicarCadeiasTruncadas(lista);
    mod.evolucoes.normalizarEvolveLevel600(lista);
    mod.ajustes?.aplicarAjustesHuntLevel?.((id) => lista.find((c) => c.pokeId === id));
    const especies = new Map();
    for (const c of lista) {
      if (mod.outland.isEspelhoFantasmaPokeId(c.pokeId)) continue;
      mod.especiais.injetarGolpesEspeciais(c);
      especies.set(c.pokeId, c);
    }
    mod.golpesOrre.herdarGolpesOrre(lista);
    for (const mega of mod.megas.criarEspeciesMega(lista)) especies.set(mega.pokeId, mega);
    return especies;
  }

  let jogoP = null;
  const carregarJogo = () => (jogoP ??= (async () => {
    const pares = await Promise.all(Object.entries(MODULOS).map(async ([k, rel]) => {
      try { return [k, await import(url(rel))]; } catch (e) { if (OPCIONAIS.has(k)) return [k, null]; throw new Error(`${rel}: ${e.message}`); }
    }));
    const json = (rel, opcional) => fetch(url(rel)).then((r) => (r.ok ? r.json() : opcional ? null : Promise.reject(new Error(`${rel}: HTTP ${r.status}`))));
    const fontes = Object.fromEntries(await Promise.all(Object.entries(CATALOGOS).map(async ([k, rel]) => [k, await json(rel, k !== 'cr').catch((e) => { if (k === 'cr') throw e; return null; })])));
    const mod = Object.fromEntries(pares);
    return { mod, especies: montarCatalogo(mod, fontes), versao: versaoDoJogo() };
  })().catch((e) => { jogoP = null; throw e; }));

  // ---- regras de combate (Pokepédia > Combate) e o que foi medido em jogo ------------------------
  const REGRAS = {
    randMedio: 0.925, stab: 1.5, gapJogadorMs: 900, gapSelvagemS: 1.4, investidaPower: 30, investidaCdMs: 2000,
    pisoCdMs: 400, msPorIvSpd: 10, hpCombateMult: 12, hpCombateMin: 24, ivSelvagemMedio: 16, poderMinimo: 15,
  };
  const MEDIDO = {
    ruidoMapa: 0.07, ruidoIndireto: 0.1, sPorAbatePadrao: 3.33, heroiSPorTile: 0.51, distMorteTiles: 20.6, respawnS: 3,
    amostrasHp: 32, maxAtaquesPorAbate: 4000, caminhadaDoMapa: 0.83, caminhadaPisoS: 1.41, caminhadaTauS: 2.8,
  };
  const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const BASE_DE = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' };
  const tiposDe = (esp) => [esp.type1, esp.type2].filter(Boolean);
  const ivSpd = (iv) => Math.min(32, Math.max(1, Math.round(Number(iv) || 1)));
  const cdPeloIv = (ms, iv) => Math.max(REGRAS.pisoCdMs, ms - ivSpd(iv) * REGRAS.msPorIvSpd);

  function dano(nivel, power, atk, def, stab, efet) {
    const base = ((2 * nivel / 5 + 2) * power * Math.max(1, atk) / Math.max(1, def)) / 50 + 2;
    return base * (stab ? REGRAS.stab : 1) * efet * REGRAS.randMedio;
  }
  function statsSelvagem(esp, nivel) {
    const o = {};
    for (const k of STATS) o[k] = ((esp[BASE_DE[k]] ?? 0) + 2 * REGRAS.ivSelvagemMedio) * nivel / 100;
    return o;
  }
  function golpesDoPokemon(pk, esp, mod) {
    return (esp.attacks ?? [])
      .filter((a) => (a.learnLevel ?? 1) <= pk.level)
      .map((a) => ({ ...a, cooldownMs: mod.cooldown.cooldownGolpeComSpeed(a.cooldownMs, esp.baseSpeed, pk.ivs?.speed) }));
  }
  // A vantagem de tipo AMPLIFICADA na hunt (o servidor manda o fator no welcome): 2 → 2,5; 0,5 → 0,33.
  const amplificar = (v, f) => (v === 0 || v === 1 ? v : v > 1 ? 1 + (v - 1) * f : v / f);
  function criarEfetividade(mod, consts) {
    const tabela = consts.tabelaTipos ?? {};
    const fator = consts.ampliacaoHunt ?? 1.5;
    const cache = new Map();
    return (atq, d1, d2) => {
      const k = `${atq}|${d1}|${d2}`;
      let v = cache.get(k);
      if (v === undefined) cache.set(k, v = amplificar(mod.analyser.efetividade(atq, d1, d2 ?? null, tabela), fator));
      return v;
    };
  }
  // a Investida sai no 1º tipo; só passa para o 2º se o alvo for imune ao 1º
  const tipoDaInvestida = ([t1, t2], ef, alvo) => (t2 && ef(t1, alvo[0], alvo[1]) === 0 ? t2 : t1);

  /** Segundos de luta por abate: a cada ataque, o golpe pronto de maior dano; sem nenhum, a Investida. */
  function segundosPorAbate(golpes, investida, gapS, hps, mortoS) {
    const ordem = golpes.map((_, i) => i).filter((i) => golpes[i].d > 0).sort((a, b) => golpes[b].d - golpes[a].d);
    // Atalho com o mesmo resultado: se nem o golpe mais forte em TODO ataque derruba o selvagem mais
    // forte dentro do limite de ataques, a simulação daria "não mata" — sem rodar milhares de ataques.
    const maxD = Math.max(investida.d, ...ordem.map((i) => golpes[i].d), 0);
    if (!(maxD > 0) || Math.max(...hps) / maxD > MEDIDO.maxAtaquesPorAbate) return Infinity;
    const pronto = golpes.map(() => 0);
    let proxInv = 0, t = 0, luta = 0;
    for (const hp of hps) {
      let feito = 0, ini = t, ultimo = t, ataques = 0;
      while (feito < hp) {
        if (++ataques > MEDIDO.maxAtaquesPorAbate) return Infinity;
        let i = -1;
        for (const j of ordem) if (pronto[j] <= t) { i = j; break; }
        if (i >= 0) { feito += golpes[i].d; pronto[i] = t + golpes[i].cdS; ultimo = t; t += gapS; }
        else if (investida.d > 0 && proxInv <= t) { feito += investida.d; proxInv = t + investida.cdS; ultimo = t; t += gapS; }
        else {
          let prox = investida.d > 0 ? proxInv : Infinity;
          for (const j of ordem) if (pronto[j] < prox) prox = pronto[j];
          if (!Number.isFinite(prox)) return Infinity;
          t = Math.max(t, prox);
        }
      }
      luta += ultimo - ini;
      t = ultimo + mortoS;
    }
    return luta / hps.length;
  }

  // o tempo morto por abate (caminhada, pausa da onda) com F segundos de luta, num mapa de sMapa por abate
  function tempoMorto(sMapa, F) {
    const encurta = Math.max(0, MEDIDO.caminhadaDoMapa * sMapa - MEDIDO.caminhadaPisoS);
    return sMapa - encurta * (1 - Math.exp(-F / MEDIDO.caminhadaTauS));
  }

  const principalDa = (h) => (h.especies ?? []).reduce((m, e) => (!m || Number(e.pontos) > Number(m.pontos) ? e : m), null);

  /** O tempo por abate de quem mata de um golpe na hunt, a faixa dele e de onde veio. */
  function tempoDoMapa(h, ritmo, especies) {
    if (!ritmo?.mapas) return { s: MEDIDO.sPorAbatePadrao, faixa: [MEDIDO.sPorAbatePadrao, MEDIDO.sPorAbatePadrao], ritmo: 'padrao' };
    const f = ritmo.faixa;
    const mapa = ritmo.hunts?.[h.slug] ?? (ritmo.fontes.has(h.slug) ? h.slug : null);
    const medido = mapa ? ritmo.mapas[mapa] : null;
    if (medido) {
      const r = medido.indireto ? MEDIDO.ruidoIndireto : MEDIDO.ruidoMapa;
      return { s: medido.s, faixa: [medido.s * (1 - r), medido.s * (1 + r)], ritmo: 'medido' };
    }
    if (!mapa) {
      const bioma = ritmo.biomas?.[especies.get(principalDa(h)?.pokeId)?.type1];
      const b = bioma ? ritmo.mapas[bioma.mapa] : null;
      if (b) return { s: b.s, faixa: [Math.min(b.s * (1 - MEDIDO.ruidoMapa), f.p10), Math.max(b.s * (1 + MEDIDO.ruidoMapa), f.p90)], ritmo: 'bioma' };
    }
    return { s: f.mediana, faixa: [f.p10, f.p90], ritmo: 'faixa' };
  }

  // As abas do mapa do jogo (a escada de temporadas). Sem `regiao`, vale a área e a geração da espécie principal.
  const REGIOES = [
    ['kanto', 'kanto', 'kanto'], ['outland', 'outland', null], ['johto', 'kanto', 'johto'], ['hoenn', 'orre', 'hoenn'],
    ['sinnoh', 'orre', 'sinnoh'], ['unova', 'orre', 'unova'], ['kalos', 'orre', 'kalos'], ['alola', 'orre', 'alola'],
    ['galar', 'orre', 'galar'], ['paldea', 'orre', 'paldea'],
  ];
  const FIM_GERACAO = [[151, 'kanto'], [251, 'johto'], [386, 'hoenn'], [493, 'sinnoh'], [649, 'unova'], [721, 'kalos'], [809, 'alola'], [905, 'galar'], [1025, 'paldea']];
  const geracaoDe = (id) => { const dex = id <= 1025 ? id : id % 1000; return FIM_GERACAO.find(([fim]) => dex <= fim)?.[1] ?? null; };
  function regiaoDaHunt(h) {
    if (h.regiao) return h.regiao;
    const peso = new Map();
    for (const e of h.especies ?? []) { const g = geracaoDe(Number(e.pokeId)); if (g) peso.set(g, (peso.get(g) ?? 0) + (Number(e.pontos) || 1)); }
    const ger = [...peso].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return REGIOES.find(([, area, g]) => area === h.area && (g == null || g === ger))?.[0] ?? h.area ?? null;
  }

  /**
   * Simula uma hunt SEM bônus de XP (eles entram depois, por cima): abates/h, XP por abate e risco.
   * `memo` guarda a luta e a ameaça de cada espécie por nível/tempo de mapa, que se repetem entre hunts.
   */
  function simularHunt(h, pk, golpesPk, ef, ctx, comPocao, memo) {
    const lista = (h.especies ?? []).map((e) => ({ esp: ctx.especies.get(e.pokeId), pontos: Number(e.pontos) || 0 })).filter((e) => e.esp && e.pontos > 0);
    const total = lista.reduce((s, e) => s + e.pontos, 0);
    if (!total) return null;
    const nivel = h.nivel ?? 1;
    const mapa = tempoDoMapa(h, ctx.ritmo, ctx.especies);
    const multSaz = ctx.mod.sazonal?.multDanoSazonal;
    const sazonal = (a, d) => (ctx.tipoDoDia && multSaz ? multSaz(ctx.tipoDoDia, a, d) : 1);
    const gapS = cdPeloIv(REGRAS.gapJogadorMs, pk.ivs?.speed) / 1000;
    const cdInvS = cdPeloIv(REGRAS.investidaCdMs, pk.ivs?.speed) / 1000;
    const multHp = ctx.consts.multHpSelvagem ?? 5;
    const multDanoSelv = ctx.consts.multDanoSelvagem ?? 1.8;

    let ttk = 0, dps = 0, hitMax = 0, xpKill = 0;
    const lutas = [];
    let melhorGolpe = null, melhorDano = -1;
    for (const { esp, pontos } of lista) {
      const w = pontos / total;
      const alvo = tiposDe(esp);
      let m = memo.get(`${esp.pokeId}|${nivel}`);
      if (!m) {
        const st = statsSelvagem(esp, nivel);
        const multEu = pk.multPodio * sazonal(pk.tipos, alvo);
        const golpes = golpesPk.map((g) => {
          const fis = g.category !== 'SPECIAL';
          return { g, cdS: g.cooldownMs / 1000, d: multEu * dano(pk.level, Math.max(REGRAS.poderMinimo, g.power), fis ? pk.stats.atk : pk.stats.spAtk, fis ? st.def : st.spDef, pk.tipos.includes(g.type), ef(g.type, alvo[0], alvo[1])) };
        });
        const investida = { cdS: cdInvS, d: multEu * dano(pk.level, REGRAS.investidaPower, pk.stats.atk, st.def, true, ef(tipoDaInvestida(pk.tipos, ef, alvo), alvo[0], alvo[1])) };
        const hps = [];
        for (let k = 0; k < MEDIDO.amostrasHp; k++) {
          const iv = 1 + Math.floor(k * 32 / MEDIDO.amostrasHp + 0.5);
          hps.push(Math.max(REGRAS.hpCombateMin, Math.round(((esp.baseHp ?? 0) + 2 * iv) * nivel / 100 * REGRAS.hpCombateMult)) * multHp);
        }
        // o que o selvagem faz com você: dano por segundo e o pior golpe (rolagem máxima)
        const multDano = multDanoSelv * sazonal(alvo, pk.tipos);
        const danos = (esp.attacks ?? []).filter((a) => (a.learnLevel ?? 1) <= nivel).map((a) => {
          const fis = a.category !== 'SPECIAL';
          return dano(nivel, Math.max(REGRAS.poderMinimo, a.power), fis ? st.atk : st.spAtk, fis ? pk.stats.def : pk.stats.spDef, alvo.includes(a.type), ef(a.type, pk.tipos[0], pk.tipos[1]));
        });
        const inv = dano(nivel, REGRAS.investidaPower, st.atk, pk.stats.def, true, ef(tipoDaInvestida(alvo, ef, pk.tipos), pk.tipos[0], pk.tipos[1]));
        const media = danos.length ? (danos.reduce((s, x) => s + x, 0) / danos.length) * 0.92 + inv * 0.08 : inv;
        m = {
          golpes, investida, hps, lutaPor: new Map(),
          dps: media * multDano / REGRAS.gapSelvagemS,
          hitMax: Math.max(inv, ...danos) / REGRAS.randMedio * multDano,
        };
        memo.set(`${esp.pokeId}|${nivel}`, m);
      }
      const luta = (morto) => {
        let s = m.lutaPor.get(morto);
        if (s === undefined) m.lutaPor.set(morto, s = segundosPorAbate(m.golpes, m.investida, gapS, m.hps, morto));
        return s;
      };
      for (const g of m.golpes) if (g.d * w > melhorDano) { melhorDano = g.d * w; melhorGolpe = g.g; }
      const s = luta(mapa.s);
      if (!Number.isFinite(s)) { ttk = Infinity; break; }
      ttk += w * s;
      lutas.push({ w, luta });
      dps += w * m.dps;
      hitMax = Math.max(hitMax, m.hitMax);
      // o XP por abate depende da hunt (nível e regras dela), não só da espécie: não vai no memo
      xpKill += w * ctx.mod.recompensa.xpPorDerrota(h, nivel, esp);
    }
    const efMedia = melhorGolpe ? lista.reduce((s, { esp, pontos }) => { const a = tiposDe(esp); return s + (pontos / total) * ef(melhorGolpe.type, a[0], a[1]); }, 0) : 1;
    const base = {
      slug: h.slug, nome: h.nome ?? h.slug, nivel, regiao: regiaoDaHunt(h), pokeId: principalDa(h)?.pokeId ?? null,
      ritmo: mapa.ritmo, melhorGolpe: melhorGolpe ? { nome: melhorGolpe.name, tipo: melhorGolpe.type } : null, efetividade: efMedia,
    };
    // A luta encurta a caminhada, e a caminhada mais curta deixa menos recarga para a luta: as duas se
    // acertam num ponto fixo, achado na reta entre a luta simulada no tempo do mapa e no piso.
    const semLuta = mapa.s, piso = tempoMorto(mapa.s, Infinity);
    if (Number.isFinite(ttk) && ttk > 0.02 && semLuta - piso > 0.02) {
      const noPiso = lutas.reduce((t, l) => t + l.w * l.luta(piso), 0);
      if (Number.isFinite(noPiso)) {
        const lutaCom = (x) => ttk + (x - semLuta) * (noPiso - ttk) / (piso - semLuta);
        let lo = piso, hi = semLuta;
        for (let i = 0; i < 30; i++) { const x = (lo + hi) / 2; if (tempoMorto(mapa.s, lutaCom(x)) >= x) lo = x; else hi = x; }
        ttk = lutaCom((lo + hi) / 2);
      }
    }
    if (!Number.isFinite(ttk)) return { ...base, inviavel: true, kph: 0, xpKill: 0, mortesH: 0, umHit: false, hitPct: 0, ttk: null, kphFaixa: null };

    const porAbate = (sMapa) => tempoMorto(sMapa, ttk) + ttk;
    const kph = 3600 / porAbate(mapa.s);
    // Morte, um selvagem por vez: com poção automática só morre quem leva de uma vez mais que o HP inteiro;
    // sem poção, quando o dano somado nos abates passa do HP.
    const hpPk = pk.maxHp ?? Math.max(REGRAS.hpCombateMin, Math.round(pk.stats.hp * REGRAS.hpCombateMult));
    const umHit = hitMax >= hpPk;
    const abatesPorVida = comPocao ? (umHit ? hpPk / hitMax : 999) : hpPk / Math.max(1e-6, dps * ttk);
    const tempoMorte = MEDIDO.respawnS + MEDIDO.distMorteTiles * MEDIDO.heroiSPorTile;
    const vidaS = abatesPorVida * (kph > 0 ? 3600 / kph : 0);
    const uptime = vidaS / (vidaS + tempoMorte);
    return {
      ...base, inviavel: false, ttk, xpKill, umHit, hitPct: hitMax / hpPk,
      kph: kph * uptime,
      kphFaixa: [3600 / porAbate(mapa.faixa[1]) * uptime, 3600 / porAbate(mapa.faixa[0]) * uptime],
      mortesH: abatesPorVida >= 999 ? 0 : 3600 / (vidaS + tempoMorte),
    };
  }

  // ---- bônus de XP -------------------------------------------------------------------------------
  const NOMES_BONUS = {
    vip: 'VIP', passeVip: 'Passe VIP', boostXp: 'XP Boost', boostPokexp: 'XP Boost Pokémon', guildBoost: 'Boost da Guild',
    guild: 'Ranking da guild', twitch: 'Twitch', kick: 'Kick', atrasados: 'Atrasados', sacrificio: 'Sacrifício',
    evento: 'Evento', raid: 'Raid Gigantamax', outros: 'Outros',
  };
  /**
   * O bônus de AGORA, como o próprio jogo calcula (`bonusXpAgora` do cliente): o total que o servidor
   * manda em `eu.bonusXp` (o que o abate paga), menos as parcelas que já venceram. Sem o campo
   * (servidor antigo), cai na conta do hunt-analyser (boosts, VIP e guild).
   */
  function bonusXp(eu, mod, tiposBoost, agora) {
    const b = eu?.bonusXp;
    if (b && Array.isArray(b.partes)) {
      const f = (x, k) => Number(x?.[k]) || 1;
      const prod = (l, k) => l.reduce((m, x) => m * f(x, k), 1);
      const resto = (k) => { const r = f(b, k) / prod(b.partes, k); return Math.abs(r - 1) < 1e-4 ? 1 : r; };
      const partes = b.partes.filter((x) => !(Number(x.ate) > 0) || x.ate > agora);
      if (resto('tr') !== 1 || resto('pk') !== 1) partes.push({ id: 'outros', tr: resto('tr'), pk: resto('pk') });
      return {
        treinador: prod(partes, 'tr'), pokemon: prod(partes, 'pk'),
        itens: partes.filter((x) => f(x, 'tr') !== 1 || f(x, 'pk') !== 1)
          .map((x) => ({ id: x.id, nome: NOMES_BONUS[x.id] ?? x.id, tr: f(x, 'tr'), pk: f(x, 'pk'), ate: Number(x.ate) || null })),
      };
    }
    return {
      treinador: mod.analyser.multXpTreinador?.(eu ?? {}, agora, tiposBoost) ?? 1,
      pokemon: mod.analyser.multXpPokemon?.(eu ?? {}, agora, tiposBoost) ?? 1,
      itens: [],
    };
  }

  // ---- a entrada pública ---------------------------------------------------------------------------
  const guardados = new Map(); // simulação por pokémon/nível/opções (sem bônus): reabrir a janela é instantâneo
  const solta = () => new Promise((r) => setTimeout(r, 0));

  /**
   * entrada: { eu (estado sem a lista de pokémons), pk (o pokémon em campo), hunts (do welcome),
   *            consts (do welcome), ritmo (tabela de ritmo), comPocao }
   * Devolve todas as hunts (o filtro de região e de "liberadas" é da tela), já com o XP/h com os bônus.
   */
  async function ranking(entrada) {
    const inicio = performance.now();
    const { eu, pk: pkBruto, hunts = [], consts = {}, comPocao = true } = entrada;
    if (!pkBruto) throw new Error('nenhum pokémon em campo');
    if (!pkBruto.stats) throw new Error('o jogo ainda não mandou os stats deste pokémon');
    const jogo = await carregarJogo();
    const esp = jogo.especies.get(pkBruto.speciesId);
    if (!esp) throw new Error(`a espécie ${pkBruto.nome ?? pkBruto.speciesId} não está no catálogo do jogo`);
    const tipos = pkBruto.tipos?.length ? pkBruto.tipos : tiposDe(esp);
    const podio = jogo.mod.ginasios?.buffGinasioDoPokemon?.(tipos, eu?.ginasiosPodio ?? eu?.ginasios ?? null) ?? null;
    const pk = { ...pkBruto, level: pkBruto.level ?? 1, tipos, multPodio: podio ? 1 + podio.pct / 100 : 1 };
    const tipoDoDia = typeof eu?.diaSazonal?.tipo === 'string' ? eu.diaSazonal.tipo : null;
    const ritmo = entrada.ritmo ? { ...entrada.ritmo, fontes: new Set(entrada.ritmo.fontes ?? []) } : null;

    const chave = JSON.stringify([pk.id, pk.speciesId, pk.level, pk.stats, pk.maxHp, pk.ivs?.speed, tipos, pk.multPodio, comPocao, tipoDoDia, hunts.length, entrada.ritmo?.geradoEm, jogo.versao]);
    let sim = guardados.get(chave);
    if (!sim) {
      const ef = criarEfetividade(jogo.mod, consts);
      const golpes = golpesDoPokemon(pk, esp, jogo.mod);
      const ctx = { mod: jogo.mod, especies: jogo.especies, consts, ritmo, tipoDoDia };
      const memo = new Map();
      const linhas = [];
      for (let i = 0; i < hunts.length; i++) {
        const r = simularHunt(hunts[i], pk, golpes, ef, ctx, comPocao, memo);
        if (r) linhas.push(r);
        if (i % 60 === 59) await solta(); // solta a página do jogo entre blocos
      }
      sim = { linhas, golpes: golpes.map((g) => ({ nome: g.name, tipo: g.type, power: g.power })) };
      guardados.set(chave, sim);
      if (guardados.size > 4) guardados.delete(guardados.keys().next().value);
    }

    const bonus = bonusXp(eu, jogo.mod, consts.tiposBoost ?? [], Date.now());
    const nomeEsp = (id) => jogo.especies.get(id)?.name ?? null;
    const linhas = sim.linhas.map((l) => ({
      ...l,
      especie: nomeEsp(l.pokeId),
      liberada: (eu?.level ?? Infinity) >= l.nivel,
      xpPokemonH: l.kph * l.xpKill * bonus.pokemon,
      xpTreinadorH: l.kph * l.xpKill * bonus.treinador,
    })).sort((a, b) => b.xpPokemonH - a.xpPokemonH || a.nivel - b.nivel);

    return {
      pokemon: { id: pk.id, nome: pk.nome ?? esp.name, level: pk.level, shiny: !!pk.shiny, tipos, xp: pk.xp, xpNivel: pk.xpNivel, xpProximo: pk.xpProximo, golpes: sim.golpes },
      treinador: { level: eu?.level ?? null, xp: eu?.xp, xpNivel: eu?.xpNivel, xpProximo: eu?.xpProximo },
      bonus, podio, tipoDoDia, huntAtual: eu?.huntSlug ?? null,
      linhas, versao: jogo.versao, ms: Math.round(performance.now() - inicio),
      medidas: linhas.filter((l) => l.ritmo === 'medido').length,
    };
  }

  window.__miHunt = { ranking, _interno: { simularHunt, segundosPorAbate, tempoMorto, bonusXp, amplificar } };
})();

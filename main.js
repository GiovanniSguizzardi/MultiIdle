const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Pasta dos dados (logins das 4 contas, zoom, link do celular). Fixa no nome antigo: o instalador
// chama o app de "MultiIdle", e sem isto o Electron passaria a usar outra pasta e todos os logins sumiriam.
// MULTIIDLE_DADOS existe só pros testes rodarem numa pasta separada.
app.setPath('userData', process.env.MULTIIDLE_DADOS || path.join(app.getPath('appData'), 'multi-idle-by-gibas'));
const APP_ID = 'com.gibas.multiidle'; // o mesmo do instalador (package.json > build.appId)
const { eventoParaAlerta, placarNovo, contar } = require('./alertas');
const remoto = require('./remoto');
const { criarMesclador } = require('./estado');
const { decidirRetry } = require('./retry');
const { avaliar, ofertaDoChat, ofertasDoResumo, textoDaOferta } = require('./precos');

// AFK com pouca CPU: janela minimizada/na bandeja/coberta PARA de desenhar (o Chromium sabe que está
// escondida), mas os relógios do jogo (ping de 25 s, vigia da conexão) seguem no ritmo normal — o farm é
// no servidor, a conta só precisa manter a conexão viva. Antes o app fingia "sempre visível" e o Chromium
// desenhava as 4 cenas sem parar, sem vsync, mesmo na bandeja (~60% de CPU).
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'IntensiveWakeUpThrottling'); // o freio extra depois de 5 min escondido
app.setAppUserModelId(APP_ID); // necessário pras notificações do Windows aparecerem (e bate com o atalho do instalador)

// O jogo derruba e reconecta sozinho com 30 s sem mensagem; 3 min sem nada = travou de verdade
const TRAVADO_MS = Number(process.env.MULTIIDLE_TRAVADO_MS) || 3 * 60 * 1000;
const GAME_URL = 'https://pokeidle.io/app';
const POUCAS_BOLAS = 50; // abaixo disso (somando todos os tipos) avisa "Pokébolas acabando"

// Todos os pedidos de quadro do mesmo instante passam juntos (o jogo tem mais de um laço); os ids
// devolvidos são estáveis, então o cancelAnimationFrame do jogo continua funcionando.
const LIMITADOR_FPS = `(() => {
  if (window.__miFps) return; // já instalado nesta página
  const pedir = window.requestAnimationFrame.bind(window);
  const cancelar = window.cancelAnimationFrame.bind(window);
  // limite SEMPRE ativo: janela coberta/minimizada sem o freio do Chromium desenhava a 200+ fps
  const st = { alvo: 30, ult: -1e9, aberto: -1 };
  const pendentes = new Map();
  let seq = 0;
  window.__miFps = st;
  window.requestAnimationFrame = (cb) => {
    const id = ++seq;
    const passo = (t) => {
      if (t !== st.aberto) {
        if (t - st.ult < 1000 / st.alvo - 2) return pendentes.set(id, pedir(passo));
        st.ult = st.aberto = t;
      }
      pendentes.delete(id);
      cb(t);
    };
    pendentes.set(id, pedir(passo));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (pendentes.has(id)) { cancelar(pendentes.get(id)); pendentes.delete(id); }
  };
})();`;

let win;
const enviar =(canal, dados) => win?.webContents.send(canal, dados);
// ---- aviso de preço bom no Mercado (regras no precos.js; quem compra é a pessoa, pelo jogo) ----
// Regras vêm do index.html; médias de 7 dias e nomes dos itens vêm do jogo e ficam salvos em disco.
let regrasPreco = [];
const mercado = { medias: {}, nomes: {} };
const arqMercado = () => path.join(app.getPath('userData'), 'mercado.json');
try { Object.assign(mercado, JSON.parse(require('fs').readFileSync(arqMercado(), 'utf8'))); } catch {}
let salvarMercadoTimer = null;
const salvarMercado = () => {
  clearTimeout(salvarMercadoTimer);
  salvarMercadoTimer = setTimeout(() => require('fs').writeFile(arqMercado(), JSON.stringify(mercado), () => {}), 2000);
};
const anunciosVistos = new Set(); // o mesmo alto-falante chega nas 4 contas: avisa uma vez
const resumosAvisados = new Map(); // item:moeda:preço do resumo -> quando avisou (não repete por 30 min)
function conferirOferta(conta, oferta) {
  const r = avaliar(oferta, regrasPreco, mercado.medias);
  if (!r) return;
  if (oferta.id != null) {
    if (anunciosVistos.has(oferta.id)) return;
    anunciosVistos.add(oferta.id);
    if (anunciosVistos.size > 2000) anunciosVistos.delete(anunciosVistos.values().next().value);
  } else {
    const chave = `${oferta.itemId}:${oferta.moeda}:${oferta.preco}`;
    if (Date.now() - (resumosAvisados.get(chave) ?? 0) < 30 * 60 * 1000) return;
    resumosAvisados.set(chave, Date.now());
    if (resumosAvisados.size > 500) for (const [k, em] of resumosAvisados) if (Date.now() - em > 30 * 60 * 1000) resumosAvisados.delete(k);
  }
  const onde = oferta.resumo ? 'menor preço no Mercado' : `anúncio #${oferta.id}`;
  alerta(conta, 'preco', `${textoDaOferta(oferta, mercado.nomes)} · ${r.motivo} · ${onde}`);
}
ipcMain.on('regras-preco', (_, r) => { regrasPreco = Array.isArray(r) ? r : []; });
ipcMain.handle('mercado-info', () => ({
  itens: Object.entries(mercado.nomes).map(([id, nome]) => ({ id: Number(id), nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  medias: Object.keys(mercado.medias).length,
}));

const alerta = (conta, tipo, texto) => {
  const a = { conta, tipo, texto, em: Date.now() };
  enviar('alerta', a);
  remoto.alerta(a); // painel do celular / push
};

// Escuta o WebSocket de cada conta pelo protocolo do DevTools, sem mexer na página do jogo
app.on('web-contents-created', (_, wc) => {
  if (wc.getType() !== 'webview') return;
  const conta = Number(wc.session.storagePath?.match(/conta(\d+)/)?.[1]);
  // logado: só vigia depois do 'welcome' (na tela de login não chega nada mesmo)
  const info = { conta, nick: null, placar: placarNovo(), logado: false, ultimaMsg: Date.now() };
  remoto.registrarConta(conta, info, wc);
  const atualizar = () => enviar('conta', { conta, nick: info.nick, placar: info.placar });
  let ultimoShiny = 0;
  // aviso de bolas acabando: uma vez ao cruzar o limite, e só rearma quando reabastecer
  let avisouBolas = false;
  const conferirBolas = () => {
    if (!info.eu?.balls) return;
    const total = Object.values(info.eu.balls).reduce((s, q) => s + (Number(q) || 0), 0);
    if (total < POUCAS_BOLAS && !avisouBolas) alerta(conta, 'poucasBolas', `restam ${total}`);
    avisouBolas = total < POUCAS_BOLAS;
  };

  // Estado do carregamento, pro retry de conta presa (regra no retry.js). 'desde' = última navegação.
  const carga = { desde: Date.now(), tentativas: 0, falhou: false };
  info.carga = carga;
  wc.on('did-navigate', () => { carga.desde = Date.now(); carga.falhou = false; });
  wc.on('did-fail-load', (_e, codigo, _desc, _url, principal) => {
    if (principal && codigo !== -3) carga.falhou = true; // -3 = navegação cancelada (normal num reload)
  });

  const recarregar = (motivo) => {
    info.logado = false; // a partir daqui quem vigia é o retry de carregamento
    alerta(conta, 'travou', motivo);
    wc.reload();
  };
  let ultimoCliqueVersao = 0;
  const vigia = setInterval(async () => {
    // O jogo mostra um aviso e PARA de reconectar quando a conta foi aberta em outro aparelho/aba (fechamento
    // 4001, "#sessao-tomada") ou foi bloqueada (ban, rede cheia: "#alerta-conta"). Pelo jogo, "tomar a conta
    // tem de ser sempre um gesto de alguém": aqui o MultiIdle só avisa e espera, sem recarregar.
    const bloqueio = await wc.executeJavaScript(`(() => {
      const visivel = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
      return visivel('sessao-tomada') ? 'tomada' : visivel('alerta-conta') ? 'conta' : null;
    })()`).catch(() => null);
    if (bloqueio) {
      if (info.bloqueio !== bloqueio) {
        alerta(conta, 'pausada', bloqueio === 'tomada'
          ? 'a conta foi aberta em outro aparelho ou aba; clique em "Jogar aqui" nela pra voltar'
          : 'o jogo mostrou um aviso na conta (veja na tela dela)');
      }
      info.bloqueio = bloqueio;
      return;
    }
    if (info.logado && Date.now() - info.ultimaMsg > TRAVADO_MS) return recarregar('3 min sem resposta do jogo');
    // Conta presa carregando/reconectando (ex.: depois de um hotfix): tenta de novo, esperando cada vez mais
    if (!info.logado) {
      const temSessao = await wc.executeJavaScript(`location.host === 'pokeidle.io' && !!localStorage.getItem('sessao')`).catch(() => false);
      const r = decidirRetry({ logado: info.logado, desde: carga.desde, temSessao, falhou: carga.falhou, tentativas: carga.tentativas, agora: Date.now() });
      if (r) {
        carga.tentativas = r.tentativa;
        if (r.tentativa === 1 || r.tentativa % 3 === 0) alerta(conta, 'travou', `presa carregando, tentativa ${r.tentativa}${r.limparCache ? ' (limpando cache)' : ''}`);
        if (r.limparCache) await wc.session.clearCache().catch(() => {});
        carga.desde = Date.now(); // conta a próxima espera a partir de agora, mesmo se a navegação nem começar
        wc.loadURL(GAME_URL).catch(() => {}); // vai direto no jogo (se tinha caído numa página de erro, sai dela); se falhar, o did-fail-load marca e a próxima tentativa vem
      }
      return;
    }
    // Versão nova do jogo (deploy/hotfix): aperta o "Recarregar agora" do próprio jogo (#aviso-versao-btn).
    // No máximo 1 vez a cada 5 min: durante o deploy o servidor pode oscilar entre versões e virar um ciclo.
    if (Date.now() - ultimoCliqueVersao < 5 * 60 * 1000) return;
    const clicou = await wc.executeJavaScript(`(() => {
      const aviso = document.getElementById('aviso-versao');
      const btn = document.getElementById('aviso-versao-btn');
      if (!aviso || aviso.classList.contains('hidden') || !btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`).catch(() => false);
    if (clicou) {
      ultimoCliqueVersao = Date.now();
      info.logado = false;
      alerta(conta, 'atualizou', 'cliquei em "Recarregar agora"');
    }
  }, Math.min(30000, TRAVADO_MS / 2));
  wc.on('destroyed', () => clearInterval(vigia));
  // Página do jogo fechando sozinha: recarrega, mas se fechar 3 vezes em 10 min, para e avisa (sem laço infinito)
  const quedas = [];
  wc.on('render-process-gone', () => {
    const agora = Date.now();
    while (quedas.length && agora - quedas[0] > 10 * 60 * 1000) quedas.shift();
    quedas.push(agora);
    if (quedas.length > 3) {
      if (quedas.length === 4) alerta(conta, 'pausada', 'a página do jogo fechou 4 vezes em 10 min; parei de recarregar (clique em ⟳ nela pra tentar de novo)');
      return;
    }
    setTimeout(() => recarregar('a página do jogo fechou'), quedas.length * 5000);
  });

  // Compra pedida pelo celular: manda pela conexão aberta do jogo a MESMA mensagem que o botão
  // "Comprar" da loja manda ({t:'shop.buy'}), e espera a resposta do servidor (evento 'compra' ou 'erro').
  // Quem valida ouro/preço é o servidor do jogo; o remoto.js só deixa passar item do catálogo da loja.
  let compraPendente = null;
  const fimCompra = (r) => {
    if (!compraPendente) return;
    clearTimeout(compraPendente.timer);
    compraPendente.resolve(r);
    compraPendente = null;
  };
  info.comprar = async (kind, id, qty) => {
    if (compraPendente) return { ok: false, erro: 'outra compra ainda em andamento' };
    const d = wc.debugger;
    let lista;
    try {
      const { result: proto } = await d.sendCommand('Runtime.evaluate', { expression: 'WebSocket.prototype' });
      ({ objects: lista } = await d.sendCommand('Runtime.queryObjects', { prototypeObjectId: proto.objectId }));
      const { result } = await d.sendCommand('Runtime.callFunctionOn', {
        objectId: lista.objectId, returnByValue: true, arguments: [{ value: JSON.stringify({ t: 'shop.buy', kind, id, qty }) }],
        functionDeclaration: `function (msg) {
          const ws = this.find((w) => w.readyState === 1 && w.url.includes('pokeidle.io'));
          if (!ws) return false;
          ws.send(msg);
          return true;
        }`,
      });
      if (!result.value) return { ok: false, erro: 'conta sem conexão com o jogo' };
    } catch (e) {
      return { ok: false, erro: 'não consegui falar com o jogo: ' + e.message };
    } finally {
      if (lista) d.sendCommand('Runtime.releaseObject', { objectId: lista.objectId }).catch(() => {});
    }
    return new Promise((resolve) => {
      compraPendente = { resolve, timer: setTimeout(() => fimCompra({ ok: false, erro: 'o jogo não respondeu' }), 8000) };
    });
  };

  try { wc.debugger.attach('1.3'); } catch { return; }
  // Limitador de FPS: roda antes dos scripts do jogo em toda página. Só segura o ritmo do
  // requestAnimationFrame (a cena do jogo é desenhada por ele e anima por tempo, então não fica lenta);
  // o farm é no servidor. O index.html ajusta window.__miFps.alvo por conta.
  wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: LIMITADOR_FPS }).catch(() => {});
  // a primeira página já estava carregando quando o registro acima entrou: instala nela também
  wc.on('dom-ready', () => wc.executeJavaScript(LIMITADOR_FPS).catch(() => {}));
  // buffers mínimos: só queremos os frames do WebSocket, não guardar cópia de tudo que a página baixa
  wc.debugger.sendCommand('Network.enable', { maxTotalBufferSize: 1024, maxResourceBufferSize: 1024 }).catch(() => {});
  wc.debugger.on('message', (_, method, p) => {
    // o 'hello' que o jogo manda ao conectar traz o nick da conta
    if (method === 'Network.webSocketFrameSent') {
      const d = p.response.payloadData;
      if (!d.includes('"hello"')) return;
      try {
        const nick = JSON.parse(d).nick;
        if (nick && nick !== info.nick) { info.nick = nick; atualizar(); }
      } catch {}
      return;
    }
    if (method !== 'Network.webSocketFrameReceived') return;
    const d = p.response.payloadData;
    if (d.length < 100 && d.includes('"pong"')) return; // o próprio jogo não conta pong como sinal de vida
    info.ultimaMsg = Date.now();
    const ehWelcome = d.includes('"t":"welcome"');
    if (ehWelcome) { info.logado = true; info.bloqueio = null; carga.tentativas = 0; carga.falhou = false; } // entrou: zera o retry
    // filtro barato antes do JSON.parse: só interessam batalha, estado, welcome (e erro, se há compra esperando)
    const ehErro = compraPendente && d.includes('"t":"erro"');
    // alto-falante do Mercado (chat ao vivo) e vitrine de itens (resumo + médias) alimentam o aviso de preço
    const ehMercado = d.includes('"anuncioChat"') || (d.includes('"t":"market"') && d.includes('"aba":"itens"'));
    if (!ehWelcome && !ehErro && !ehMercado && !d.includes('"batalha"') && !d.includes('"t":"estado"')) return;
    let m;
    try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'erro') return fimCompra({ ok: false, erro: m.msg ?? m.chave ?? 'recusada pelo jogo' });
    // só o chat AO VIVO ('chat'); o 'chat.historico' do login traz anúncios velhos
    if (m.t === 'chat') { const o = ofertaDoChat(m.anuncioChat); if (o) conferirOferta(conta, o); return; }
    if (m.t === 'market' && m.aba === 'itens') {
      if (m.medias) { Object.assign(mercado.medias, m.medias); salvarMercado(); }
      for (const o of ofertasDoResumo(m.resumo, mercado.nomes)) conferirOferta(conta, o);
      return;
    }
    if (m.t === 'welcome' || m.t === 'estado') {
      if (m.t === 'welcome') {
        info.mesclar = criarMesclador(); // conexão nova = quadro novo
        const catalogo = m.mercado?.catalogo ?? [];
        if (catalogo.length) { mercado.nomes = Object.fromEntries(catalogo.map((i) => [i.id, i.nome])); salvarMercado(); }
        info.ctx = {
          hunts: Object.fromEntries((m.hunts ?? []).map((h) => [h.slug, h.nome])),
          bolas: Object.fromEntries((m.catalogoBolas ?? []).map((b) => [b.id, b.nome])),
          // o que a loja NPC vende (a mesma lista da aba Compra > Bolas do jogo)
          bolasLoja: (m.catalogoBolas ?? []).filter((b) => b.compravel && b.priceGold > 0)
            .map((b) => ({ id: b.id, nome: b.nome, preco: b.priceGold, captura: b.catchRate })),
        };
      }
      info.eu = info.mesclar?.(m.estado) ?? info.eu;
      conferirBolas();
      return;
    }
    if (m.t !== 'batalha') return;
    let mudou = false;
    for (const e of m.ev ?? []) {
      if (e.k === 'compra') fimCompra({ ok: true, nome: e.nome, qtd: e.qtd, gasto: e.gasto });
      mudou = contar(info.placar, e) || mudou;
      const a = eventoParaAlerta(e);
      if (!a) continue;
      // cada bola jogada num shiny gera evento; avisa uma vez só por encontro
      if (a[0] === 'shinyVisto') {
        if (Date.now() - ultimoShiny < 60000) continue;
        ultimoShiny = Date.now();
      }
      alerta(conta, ...a);
    }
    if (mudou) atualizar();
  });
});

// só uma instância: abrir o .bat de novo só traz a janela de volta (senão seriam 8 contas logadas)
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => mostrar());

let tray;
let saindo = false;
let avisouBandeja = false;
const mostrar = () => { win?.show(); win?.focus(); };

app.whenReady().then(() => {
  const icone = `${__dirname}/icon.png`;
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    title: 'MultiIdle by Gibas',
    icon: icone,
    autoHideMenuBar: true,
    // a janela principal só carrega o index.html local; as webviews do jogo não herdam isso
    webPreferences: { webviewTag: true, nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(`${__dirname}/index.html`);
  remoto.iniciar(win);
  // janela minimizada/na bandeja = ninguém vendo: o index.html baixa as contas pra 1 quadro por segundo
  const visibilidade = () => enviar('janela-visivel', win.isVisible() && !win.isMinimized());
  for (const ev of ['hide', 'show', 'minimize', 'restore']) win.on(ev, visibilidade);
  iniciarUpdates();

  // fechar (X) esconde na bandeja; as contas continuam rodando. Sair de verdade é pelo menu da bandeja.
  win.on('close', (e) => {
    if (saindo) return;
    e.preventDefault();
    win.hide();
    if (!avisouBandeja) {
      avisouBandeja = true;
      new Notification({ title: 'MultiIdle continua rodando', body: 'As contas seguem farmando. Clique no ícone perto do relógio para abrir, ou em "Sair" para fechar de vez.', icon: icone }).show();
    }
  });

  tray = new Tray(icone);
  tray.setToolTip('MultiIdle by Gibas');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir MultiIdle', click: mostrar },
    { label: `Procurar atualização (v${app.getVersion()})`, click: () => checarUpdate(true) },
    { type: 'separator' },
    { label: 'Sair (para o AFK)', click: () => { saindo = true; app.quit(); } },
  ]));
  tray.on('click', mostrar);
});

app.on('before-quit', () => { saindo = true; });

// ---- atualização automática (GitHub Releases, ver package.json > build.publish) ----
// Só no app instalado: rodando pelo MultiIdle.bat (desenvolvimento) não há o que atualizar.
// Baixa sozinho em segundo plano; instala quando a pessoa clica "Atualizar" ou na próxima vez que sair.
let update = { estado: 'nada', versao: null };
const avisarUpdate = (u) => { update = { ...update, ...u }; enviar('update', update); };
function checarUpdate(manual = false) {
  if (!app.isPackaged) return manual && avisarUpdate({ estado: 'dev' });
  update.manual = manual; // erro de checagem automática fica quieto; só a pedida mostra
  if (manual) avisarUpdate({ estado: 'procurando' });
  autoUpdater.checkForUpdates().catch((e) => avisarUpdate({ estado: 'erro', erro: e.message }));
}
function iniciarUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => avisarUpdate({ estado: 'baixando', versao: i.version, pct: 0 }));
  autoUpdater.on('update-not-available', () => avisarUpdate({ estado: 'em-dia' }));
  autoUpdater.on('download-progress', (p) => avisarUpdate({ estado: 'baixando', pct: Math.round(p.percent) }));
  let notificouVersao = null;
  autoUpdater.on('update-downloaded', (i) => {
    avisarUpdate({ estado: 'pronto', versao: i.version });
    if (notificouVersao === i.version) return; // a checagem de 3 em 3 h acha o mesmo download: não repete
    notificouVersao = i.version;
    new Notification({ title: `MultiIdle v${i.version} pronto`, body: 'Clique em "Atualizar" no topo do MultiIdle (leva uns segundos e as contas voltam sozinhas).', icon: `${__dirname}/icon.png` }).show();
  });
  autoUpdater.on('error', (e) => avisarUpdate({ estado: 'erro', erro: e.message }));
  ipcMain.handle('update-info', () => ({ ...update, atual: app.getVersion(), instalado: app.isPackaged }));
  ipcMain.on('update-checar', () => checarUpdate(true));
  ipcMain.on('update-instalar', () => {
    saindo = true;
    autoUpdater.quitAndInstall(true, true); // instala calado e abre o MultiIdle de novo
  });
  checarUpdate();
  setInterval(checarUpdate, 3 * 3600 * 1000);
}
app.on('window-all-closed', () => app.quit());

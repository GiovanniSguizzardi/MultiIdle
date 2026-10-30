// Acompanhar pelo celular: painel web (porta 7777) na rede de casa e, com o Tailscale, de qualquer lugar.
// Acesso protegido por um token aleatório no link (o QR code já leva ele).
// O painel começa DESLIGADO em instalação nova: abrir uma porta na rede é escolha de quem usa.
const http = require('http');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { app, ipcMain } = require('electron');
const QRCode = require('qrcode');
const { TIPOS, placarNovo } = require('./alertas');
const { resumir } = require('./estado');

const PORTA = Number(process.env.MULTIIDLE_PORTA) || 7777;
const ACOES = ['reload', 'eco', 'home', 'zerar']; // zerar é feito aqui; as outras o index.html executa

const contas = {};    // conta -> { info, wc } (info vem do main.js: nick, placar, logado, ultimaMsg)
const historico = []; // últimos alertas, já filtrados pelas mesmas preferências do PC
let prefs = { ligados: {} }; // vem do index.html (localStorage de lá)
let cfg;
let win;
let erroServidor = null;
let servidor = null;
const arqConfig = () => `${app.getPath('userData')}/remoto.json`;
const salvarConfig = () => fs.writeFileSync(arqConfig(), JSON.stringify(cfg));

// o token fica salvo: o link no celular continua valendo entre aberturas
function lerConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(arqConfig(), 'utf8'));
    c.painel ??= true; // config de antes desta opção existir = quem já usava o painel
    return c;
  } catch {}
  const c = { token: crypto.randomBytes(12).toString('hex'), painel: false };
  fs.writeFileSync(arqConfig(), JSON.stringify(c));
  return c;
}

// Tailscale dá ao PC um IP na faixa 100.64.0.0/10 (100.64.x.x – 100.127.x.x): é o endereço "fora de casa"
const ehTailscale = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
const ipv4s = () => Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
// IPs de casa; o de Wi-Fi/cabo (192.168.x, menos o 192.168.56 do VirtualBox) primeiro
function ipsCasa() {
  const nota = (ip) => /^192\.168\.(?!56\.)/.test(ip) ? 0 : ip.startsWith('10.') ? 1 : 2;
  return ipv4s().filter(ip => !ehTailscale(ip)).sort((a, b) => nota(a) - nota(b));
}
const link = (ip) => `http://${ip}:${PORTA}/?t=${cfg.token}`;

const nomeDa = (conta) => contas[conta]?.info.nick ?? `Conta ${conta}`;
function status(info) {
  if (info.bloqueio) return 'pausada';
  if (!info.logado) return 'fora';
  return Date.now() - info.ultimaMsg < 60000 ? 'online' : 'quieto';
}

function alerta(a) {
  if (!prefs.ligados[a.tipo]) return;
  historico.unshift({ ...a, nome: nomeDa(a.conta) });
  historico.length = Math.min(historico.length, 100);
}

async function lerJson(req) {
  let corpo = '';
  for await (const parte of req) { corpo += parte; if (corpo.length > 1000) break; }
  try { return JSON.parse(corpo); } catch { return null; }
}

// Loja NPC. Bolas vêm do welcome de cada conta; poções e revives do mesmo /assets/items.json que o
// jogo carrega (categoria heal/revive com npcPrice > 0 — o filtro da aba Compra do jogo).
const MAX_COMPRA = 9999; // o mesmo teto do botão "Máx" da loja do jogo
let catalogoItens = null; // { em, itens }
// Poções e revives do jogo (categoria heal/revive). Com preço de loja = à venda; os outros (drops) só contam no estoque.
async function consumiveis() {
  if (catalogoItens && Date.now() - catalogoItens.em < 6 * 3600 * 1000) return catalogoItens.itens;
  try {
    const { items } = await (await fetch('https://pokeidle.io/assets/items.json')).json();
    const itens = items.filter((i) => i.category === 'heal' || i.category === 'revive')
      .sort((a, b) => a.npcPrice - b.npcPrice)
      .map((i) => ({ id: i.id, nome: i.name, preco: i.npcPrice, cat: i.category, cura: i.healAmount ?? null, revive: i.revivePct ?? null }));
    catalogoItens = { em: Date.now(), itens };
  } catch {
    if (!catalogoItens) return [];
  }
  return catalogoItens.itens;
}
const itensDaLoja = async () => (await consumiveis()).filter((i) => i.preco > 0);

// O que a conta tem de bolas, poções e revives — o que o painel do celular mostra sempre no topo
async function estoque(info) {
  const eu = info.eu;
  if (!eu) return null;
  const grupo = (lista) => {
    const itens = lista.filter((x) => x.qtd > 0).sort((a, b) => b.qtd - a.qtd);
    return { total: itens.reduce((s, x) => s + x.qtd, 0), itens };
  };
  const cat = await consumiveis();
  const de = (c) => cat.filter((i) => i.cat === c).map((i) => ({ nome: i.nome, qtd: Number(eu.items?.[i.id]) || 0 }));
  const nomesBolas = info.ctx?.bolas ?? {};
  return {
    bolas: grupo(Object.entries(eu.balls ?? {}).map(([id, q]) => ({ nome: nomesBolas[id] ?? `Ball #${id}`, qtd: Number(q) || 0 }))),
    pocoes: grupo(de('heal')),
    revives: grupo(de('revive')),
  };
}
async function vitrine(info) {
  const eu = info.eu;
  return {
    gold: Number(eu.gold) || 0,
    bolas: (info.ctx?.bolasLoja ?? []).map((b) => ({ ...b, tem: Number(eu.balls?.[b.id]) || 0 })),
    itens: (await itensDaLoja()).map((i) => ({ ...i, tem: Number(eu.items?.[i.id]) || 0 })),
    max: MAX_COMPRA,
  };
}

const json = (res, dados, codigo = 200) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
};
const ARQUIVOS = { '/tema.css': ['tema.css', 'text/css; charset=utf-8'], '/icon.png': ['icon.png', 'image/png'] };

async function rota(req, res) {
  const url = new URL(req.url, 'http://x');
  const estatico = ARQUIVOS[url.pathname];
  if (estatico) { // tema e ícone não têm nada sensível
    res.writeHead(200, { 'Content-Type': estatico[1] });
    return res.end(fs.readFileSync(`${__dirname}/${estatico[0]}`));
  }
  if (url.searchParams.get('t') !== cfg.token) { res.writeHead(403); return res.end('acesso negado'); }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(`${__dirname}/painel.html`));
  }
  if (url.pathname === '/manifest.json') { // "Adicionar à tela inicial" abre direto no painel
    return json(res, {
      name: 'MultiIdle', short_name: 'MultiIdle', display: 'standalone', start_url: `/?t=${cfg.token}`,
      background_color: '#3357e3', theme_color: '#bd6951', icons: [{ src: '/icon.png', sizes: '48x48', type: 'image/png' }],
    });
  }
  if (url.pathname === '/api/estado') {
    const lista = await Promise.all(Object.entries(contas).map(async ([n, { info, wc }]) => ({
      conta: Number(n), nome: nomeDa(n), placar: info.placar, status: status(info),
      semMsgHa: Date.now() - info.ultimaMsg,
      jogo: info.logado ? resumir(info.eu, info.ctx ?? { hunts: {}, bolas: {} }) : null,
      estoque: info.logado ? await estoque(info) : null,
      eco: await wc.executeJavaScript(`localStorage.getItem('cfg-economia') === '1'`).catch(() => null),
    })));
    return json(res, { versao: app.getVersion(), agora: Date.now(), contas: lista.sort((a, b) => a.conta - b.conta), alertas: historico.slice(0, 100), tipos: TIPOS });
  }
  const print = url.pathname.match(/^\/api\/print\/([1-4])$/);
  if (print) {
    const wc = contas[print[1]]?.wc;
    const img = wc && !wc.isDestroyed() ? await wc.capturePage() : null;
    if (!img || img.isEmpty()) { res.writeHead(204); return res.end(); } // janela escondida/minimizada não pinta
    // ?w= deixa a "tela ao vivo" pedir mais resolução que a miniatura
    const largura = Math.min(1280, Math.max(240, Number(url.searchParams.get('w')) || 480));
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    return res.end(img.resize({ width: largura }).toJPEG(largura > 600 ? 70 : 60));
  }
  if (url.pathname === '/api/loja') {
    const info = contas[url.searchParams.get('conta')]?.info;
    if (!info?.logado || !info.eu) return json(res, { erro: 'conta fora do jogo' }, 409);
    return json(res, await vitrine(info));
  }
  if (url.pathname === '/api/comprar' && req.method === 'POST') {
    const p = await lerJson(req);
    const info = contas[p?.conta]?.info;
    if (!info?.logado || !info.eu || !info.comprar) return json(res, { ok: false, erro: 'conta fora do jogo' }, 409);
    // só passa o que está à venda na loja NPC, em quantidade que o ouro da conta paga
    const v = await vitrine(info);
    const produto = (p.kind === 'ball' ? v.bolas : p.kind === 'item' ? v.itens : []).find((x) => x.id === Number(p.id));
    const qty = Math.floor(Number(p.qty));
    if (!produto) return json(res, { ok: false, erro: 'item não está à venda na loja' }, 400);
    if (!(qty >= 1 && qty <= MAX_COMPRA)) return json(res, { ok: false, erro: `quantidade entre 1 e ${MAX_COMPRA}` }, 400);
    if (qty * produto.preco > v.gold) return json(res, { ok: false, erro: 'ouro insuficiente' }, 400);
    return json(res, await info.comprar(p.kind, produto.id, qty));
  }
  if (url.pathname === '/api/acao' && req.method === 'POST') {
    const p = await lerJson(req);
    if (!p) return json(res, { erro: 'json' }, 400);
    const conta = Number(p.conta);
    if (!(conta >= 1 && conta <= 4) || !ACOES.includes(p.acao)) return json(res, { erro: 'ação inválida' }, 400);
    if (p.acao === 'zerar') {
      const c = contas[conta];
      if (c) { c.info.placar = placarNovo(); win?.webContents.send('conta', { conta, nick: c.info.nick, placar: c.info.placar }); }
    } else {
      win?.webContents.send('acao', { conta, acao: p.acao }); // o index.html aperta o botão do painel
    }
    return json(res, { ok: true });
  }
  res.writeHead(404);
  res.end();
}

function ligarServidor(ligar) {
  if (!ligar) {
    servidor?.close();
    servidor = null;
    return;
  }
  if (servidor) return;
  erroServidor = null;
  servidor = http.createServer((req, res) => rota(req, res).catch((e) => {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(e.message));
  }));
  servidor.on('error', (e) => {
    erroServidor = e.code === 'EADDRINUSE' ? `a porta ${PORTA} já está em uso` : e.message;
    servidor = null;
  });
  servidor.listen(PORTA, '0.0.0.0'); // 0.0.0.0 = rede de casa E a interface do Tailscale
}

function iniciar(janela) {
  win = janela;
  cfg = lerConfig();
  ligarServidor(cfg.painel);

  ipcMain.on('prefs', (_, p) => { prefs = p; });
  ipcMain.handle('painel-ligar', (_, ligar) => {
    cfg.painel = !!ligar;
    salvarConfig();
    ligarServidor(cfg.painel);
  });
  ipcMain.handle('remoto-info', async () => {
    const casa = ipsCasa().map(link);
    const ts = ipv4s().find(ehTailscale);
    const qr = (texto, width) => QRCode.toDataURL(texto, { margin: 1, width });
    return {
      painel: cfg.painel, erro: erroServidor,
      links: casa, qr: casa[0] ? await qr(casa[0], 220) : null,
      tailscale: ts ? link(ts) : null, qrTailscale: ts ? await qr(link(ts), 220) : null,
    };
  });
}

const registrarConta = (conta, info, wc) => { contas[conta] = { info, wc }; };

module.exports = { iniciar, registrarConta, alerta };

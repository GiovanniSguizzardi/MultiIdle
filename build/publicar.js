// npm run release: gera o instalador, publica no GitHub Releases e preenche título + descrição com a seção
// da versão no CHANGELOG.md. Sem a seção, para antes de gerar qualquer coisa.
const { build } = require('electron-builder');
const pkg = require('../package.json');
const { lerNotas } = require('./notas');

const REPO = `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`;

// O electron-builder cria o Release só com o número da versão; o texto entra aqui, pela API do GitHub.
async function preencherRelease(tag, notas) {
  const h = { Authorization: `Bearer ${process.env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json; charset=utf-8' };
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers: h });
  if (!r.ok) throw new Error(`não achei o Release ${tag} no GitHub (${r.status})`);
  const { id } = await r.json();
  const p = await fetch(`https://api.github.com/repos/${REPO}/releases/${id}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ name: notas.nome, body: notas.descricao }),
  });
  if (!p.ok) throw new Error(`não consegui escrever a descrição do Release ${tag} (${p.status})`);
}

async function principal() {
  const notas = lerNotas(pkg.version);
  if (!process.env.GH_TOKEN) throw new Error('Falta a variável GH_TOKEN (veja o topo do Publicar-Atualizacao.bat).');
  console.log(`Publicando ${notas.nome}`);
  await build({ win: ['nsis'], publish: 'always' });
  await preencherRelease(`v${pkg.version}`, notas);
  console.log(`Release v${pkg.version} publicado com título e descrição: https://github.com/${REPO}/releases/tag/v${pkg.version}`);
}

if (process.argv.includes('--so-descricao')) {
  // conserta só o texto de um Release já publicado (a versão do package.json)
  preencherRelease(`v${pkg.version}`, lerNotas(pkg.version)).then(() => console.log('descrição preenchida'), (e) => { console.error(e.message); process.exit(1); });
} else {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}

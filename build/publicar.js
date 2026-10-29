// npm run release: gera o instalador e publica no GitHub Releases com título e descrição do CHANGELOG.md.
// Sem a seção da versão no CHANGELOG, para antes de gerar qualquer coisa.
const { build } = require('electron-builder');
const pkg = require('../package.json');
const { lerNotas } = require('./notas');

const notas = lerNotas(pkg.version);
console.log(`Publicando ${notas.nome}`);
build({
  win: ['nsis'],
  publish: 'always',
  config: { ...pkg.build, releaseInfo: { releaseName: notas.nome, releaseNotes: notas.descricao } },
}).catch((e) => {
  console.error(e.message);
  process.exit(1);
});

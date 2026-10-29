// Notas de versão: lê a seção `## vX.Y.Z — Título` do CHANGELOG.md e monta título + descrição do Release.
// Uso:
//   node build/notas.js                 -> auto-teste
//   node build/notas.js --proxima patch -> confere se o CHANGELOG já tem a próxima versão (patch|minor|major);
//                                          se não tiver, põe um modelo no topo e sai com erro (pra preencher)
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '..', 'CHANGELOG.md');
const MODELO_TITULO = 'TÍTULO CURTO AQUI';

function lerNotas(versao, texto = fs.readFileSync(ARQ, 'utf8')) {
  const linhas = texto.split(/\r?\n/);
  const ini = linhas.findIndex((l) => l.startsWith(`## v${versao} `) || l === `## v${versao}`);
  if (ini < 0) throw new Error(`O CHANGELOG.md não tem a seção "## v${versao} — Título". Escreva as novidades antes de publicar.`);
  const titulo = linhas[ini].replace(`## v${versao}`, '').replace(/^\s*[—-]\s*/, '').trim();
  let fim = linhas.findIndex((l, i) => i > ini && l.startsWith('## v'));
  if (fim < 0) fim = linhas.length;
  const corpo = linhas.slice(ini + 1, fim).join('\n').trim();
  if (!titulo || !corpo) throw new Error(`A seção v${versao} do CHANGELOG.md está sem título ou sem texto.`);
  if (titulo.includes(MODELO_TITULO) || /^\s*-\s*$/m.test(corpo)) {
    throw new Error(`A seção v${versao} do CHANGELOG.md ainda está com o modelo: troque o título e preencha (ou apague) os itens vazios.`);
  }
  return { titulo, corpo, nome: `v${versao} — ${titulo}`, descricao: `${corpo}\n\n${rodape(versao)}` };
}

const rodape = (v) => `---
**🔄 Já usa o MultiIdle?** Ele atualiza sozinho: quando aparecer o botão dourado **"🔄 Atualizar para v${v}"** no topo, é só clicar (ou clique na versão ao lado do logo pra procurar agora).

**⬇️ Primeira vez?** Baixe o \`MultiIdle-Setup-${v}.exe\` em **Assets**, logo abaixo, e instale. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo** (o app não tem assinatura digital paga).`;

function proximaVersao(atual, nivel) {
  const [a, b, c] = atual.split('.').map(Number);
  if (nivel === 'major') return `${a + 1}.0.0`;
  if (nivel === 'minor') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

module.exports = { lerNotas, proximaVersao };

if (require.main === module) {
  const i = process.argv.indexOf('--proxima');
  if (i > 0) {
    const v = proximaVersao(require('../package.json').version, process.argv[i + 1]);
    const texto = fs.readFileSync(ARQ, 'utf8');
    try {
      lerNotas(v, texto);
      console.log(`CHANGELOG ok para v${v}`);
    } catch (e) {
      if (texto.includes(`## v${v} `)) { console.error(e.message); process.exit(1); } // existe, mas incompleta
      const modelo = `## v${v} — ${MODELO_TITULO}\n\n### ✨ Novidades\n- \n\n### 🔧 Correções\n- \n\n`;
      fs.writeFileSync(ARQ, texto.replace(/\n## v/, `\n${modelo}## v`));
      console.error(`Falta escrever as novidades da v${v}. Coloquei um modelo no topo do CHANGELOG.md: preencha (apague as seções que não usar) e rode de novo.`);
      process.exit(1);
    }
    return;
  }
  const assert = require('assert');
  const exemplo = '# x\n\n## v2.0.0 — Grande\n\n- a\n\n## v1.0.0 — Primeira\n\n### ✨ Novidades\n- b\n';
  const n = lerNotas('1.0.0', exemplo);
  assert.equal(n.titulo, 'Primeira');
  assert.equal(n.nome, 'v1.0.0 — Primeira');
  assert.ok(n.descricao.startsWith('### ✨ Novidades\n- b'));
  assert.ok(n.descricao.includes('MultiIdle-Setup-1.0.0.exe'));
  assert.equal(lerNotas('2.0.0', exemplo).corpo, '- a'); // para na próxima versão
  assert.throws(() => lerNotas('3.0.0', exemplo));
  assert.throws(() => lerNotas('1.2.0', '## v1.2.0 — TÍTULO CURTO AQUI\n\n- a\n')); // modelo sem preencher
  assert.throws(() => lerNotas('1.2.0', '## v1.2.0 — Bom\n\n### Novidades\n- \n')); // item vazio
  assert.equal(proximaVersao('1.1.0', 'patch'), '1.1.1');
  assert.equal(proximaVersao('1.1.3', 'minor'), '1.2.0');
  assert.equal(proximaVersao('1.1.3', 'major'), '2.0.0');
  // o CHANGELOG de verdade tem toda versão já publicada
  for (const v of ['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.1.0']) lerNotas(v);
  console.log('ok');
}

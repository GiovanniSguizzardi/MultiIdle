# Novidades do MultiIdle

Cada versão nova entra no topo, no formato `## vX.Y.Z — Título`. O texto da seção vira a descrição
do Release no GitHub. Sem a seção, a publicação não roda.

## v1.3.0 — 📱 Painel do celular novo, mais limpo

### ✨ Novidades
- **Visual novo no celular:** fundo escuro liso, cartões simples e botões maiores para o dedo. As cores do jogo continuam nos detalhes.
- **Pokébolas, poções, revives e ouro sempre à vista:** uma barra fixa no topo da conta que não some ao rolar.
  - **Fica vermelha com ⚠** quando o estoque está baixo: menos de 50 bolas, 20 poções ou 5 revives.
  - **Toque num bloco** para ver o estoque por tipo, com um botão **"Comprar"** que abre a loja já na aba certa.
- **Poções e revives** agora aparecem no painel. Antes, só dava para ver dentro da loja.
- **Na aba Geral,** cada conta mostra pokébolas, poções e revives em destaque, para ver de relance qual conta precisa de reposição.
- **Mais limpo:** capturas, achados e a tela ficam em seções que abrem e fecham, e o celular lembra como você deixou.

## v1.2.0 — 📺 Lives parceiras da Twitch

### ✨ Novidades
- **Novo botão 📺 Lives no topo**, com o mesmo visual da tela da Twitch do PokeIdle:
  - as lives oficiais **ao vivo** primeiro, com o selo dourado **"⚡ Bônus ativado"**, os espectadores e o "● AO VIVO";
  - **"✓ você já está lá"** quando o jogo já encontrou as suas contas na live;
  - os canais offline ficam dobrados embaixo.
- **Clique numa live para abrir o canal no seu navegador**, onde você já está logado na Twitch.
- **O bônus de cada conta** aparece no alto do painel: "+15% de XP", "live no ar, ainda não detectado", "offline" ou "Twitch não vinculada".
- **Ponto vermelho piscando no botão** quando tem live com bônus no ar que alguma das suas contas com Twitch vinculada ainda não abriu.
- **Novo alerta "🔴 Live parceira no ar"** quando uma live com bônus começa (no máximo um aviso por live a cada 2 horas).

> O bônus é de quem assiste de verdade: o MultiIdle só mostra as lives e abre o canal no navegador. A conta da Twitch é vinculada no próprio PokeIdle.

## v1.1.1 — 🐛 Caça aos bugs: o MultiIdle não "rouba" mais a sua conta

### 🔧 Correções
- **Abriu a conta no celular ou no navegador? O MultiIdle não toma mais ela de volta.** Antes, quando o jogo mostrava o aviso de "sessão tomada", o MultiIdle recarregava aquela conta depois de 3 minutos e derrubava você de onde estava jogando. Agora a conta fica **⏸️ pausada**: você recebe um aviso e, quando quiser voltar, é só clicar em **"Jogar aqui"** na tela dela.
- **Conta com aviso de bloqueio** (banimento, rede bloqueada) também fica pausada, sem o MultiIdle insistir em recarregar.
- **Página do jogo travando em sequência:** o app recarrega com espera crescente e, se ela fechar 4 vezes em 10 minutos, para e avisa, em vez de ficar em ciclo.
- **Um evento de captura sem os dados do Pokémon** não faz mais o app perder os outros eventos que vieram junto (abates, XP, drops).
- **A notificação "MultiIdle vX pronto"** aparece uma vez só, em vez de repetir a cada 3 horas.
- **Correção de um pequeno vazamento de memória** nos avisos de preço, em sessões muito longas.

### ✨ Novidades
- **O 🔇 de cada conta agora é lembrado** quando o MultiIdle abre de novo.
- **Novo alerta "⏸️ Conta pausada"** no PC e no celular, onde a conta aparece com o status "⏸️ pausada".

## v1.1.0 — 💸 Aviso de preço bom no Mercado

### ✨ Novidades
- **Botão 💸 Preços no topo:** crie regras e o MultiIdle avisa quando aparecer um preço bom no Mercado:
  - um item até um preço, por exemplo "Fire Stone até 500 coins";
  - um item abaixo de uma % da média de 7 dias do próprio jogo;
  - **qualquer item** abaixo de uma % da média (use `*` no nome);
  - um Pokémon até um preço, com a opção "só shiny".
- **O aviso vem com som próprio** ("ding-ding-ding", com liga/desliga e botão Testar), notificação do Windows, histórico e painel do celular, onde o telefone vibra.
- **De onde vêm os avisos:** dos anúncios com **alto-falante**, que chegam ao vivo pelo chat, e do **menor preço** de cada item quando você abre o Mercado de itens em qualquer conta.
- **Sem repetição:** o mesmo anúncio visto pelas 4 contas avisa uma vez só, e anúncios velhos do histórico do chat não avisam.

> O MultiIdle **só avisa**: a compra continua sendo sua, pelo próprio jogo.

## v1.0.4 — 🔁 Retry automático de conta presa carregando

### 🔧 Correções
- **Conta presa carregando depois de um hotfix agora volta sozinha.** Se uma conta com sessão salva passar 2 minutos sem entrar no jogo, o MultiIdle recarrega a página. O mesmo vale se a página nem carregar.
- **As tentativas vão ficando mais espaçadas** (2, 3, 5 e depois a cada 10 minutos), para não martelar o servidor durante o deploy.
- **Da 3ª tentativa em diante, o cache daquela conta é limpo antes de recarregar.** Os logins não são afetados.
- **O "Recarregar agora" automático** vale no máximo 1 vez a cada 5 minutos, para não virar um ciclo durante o deploy.
- **A tela de login de quem saiu da conta** continua sem retry.

## v1.0.3 — ⚡ Muito menos CPU com o app na bandeja

### ⚡ Desempenho
- **Com o MultiIdle minimizado, na bandeja ou coberto, o PC para de desenhar as 4 contas.** No teste, o consumo caiu de **46% para menos de 2%** de CPU.
- **As contas continuam conectadas e farmando normalmente:** os relógios do jogo (o "ping" a cada 25 s e o vigia de conexão) seguem no ritmo certo, mesmo depois de horas escondido.

## v1.0.2 — 🎞️ Limite de FPS

### ⚡ Desempenho
- **Novo botão 🎞️ no topo:** limita quantos quadros por segundo cada conta desenha (60, 30, 20 ou 10). O padrão é **30**, metade do desenho de antes. O jogo não fica em câmera lenta, só menos fluido, e o farm, que acontece no servidor, não muda.
- **Contas que ninguém está vendo caem para 1 quadro por segundo sozinhas:** janela minimizada ou na bandeja, ou outra conta ampliada no ⛶.

### 🔧 Correções
- **O alerta pisca 7 vezes e o anel dourado fica parado,** em vez de piscar sem parar até você clicar.

## v1.0.1 — 🧹 Tela do celular mais simples

### 🔧 Correções
- **Saem as notificações pelo app ntfy:** a seção da janela 📱 Celular e a coluna 📱 dos alertas.
- O painel do celular, em casa e pelo Tailscale, continua igual.

## v1.0.0 — 🎉 Primeira versão

### ✨ Novidades
- **4 contas do PokeIdle numa janela só,** cada uma com seu login salvo.
- **Layouts 2×2, 1 grande + 3 e 4 lado a lado,** com divisórias ajustáveis e zoom por conta.
- **O AFK continua com a janela minimizada.** O X esconde o app na bandeja.
- **Alertas:** shiny visto ou capturado, capturas, desmaio, boss, item vendido no Market, pokébolas acabando e conta travada. Os alertas têm sons próprios e notificação do Windows.
- **Recarrega sozinho** a conta que travar e aperta o "Recarregar agora" quando o jogo atualiza.
- **🍃 Modo Economia** do jogo, numa conta ou em todas.
- **📱 Painel no celular:** nível, equipe com HP, sessão por hora, pokébolas, **loja** (comprar bolas e poções), tela ao vivo e alertas. Funciona em casa e, com o Tailscale, de qualquer lugar.
- **Atualização automática:** as versões novas chegam sozinhas.

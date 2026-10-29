# Novidades do MultiIdle

Cada versão nova entra no topo, no formato `## vX.Y.Z — Título`. O texto da seção vira a descrição
do Release no GitHub. Sem a seção, a publicação não roda.

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

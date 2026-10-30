<div align='center'>
  <img width="600" height="600" alt="icon" src="https://github.com/user-attachments/assets/8baeb85e-e73b-4425-bc67-6f52e8383de8" />
</div>

# MultiIdle

Até 4 contas do [PokeIdle](https://pokeidle.io/app) numa janela só, para deixar AFK sem precisar de 4 abas.

Projeto de fã, sem ligação oficial com o PokeIdle.

## Instalar
1. Baixe o `MultiIdle-Setup-x.y.z.exe` mais recente em [Releases](https://github.com/GiovanniSguizzardi/MultiIdle/releases/latest).
2. Abra o instalador. O Windows pode mostrar **"O Windows protegeu o computador"**, porque o app não tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.
3. Entre com uma conta em cada painel. Os logins ficam salvos.

## Atualizações
O MultiIdle procura versão nova sozinho (ao abrir e a cada 3 horas) e baixa em segundo plano. Quando terminar, aparece um botão dourado **"🔄 Atualizar para vX"** no topo. As contas voltam logadas depois da atualização.

## O que ele faz
- **4 contas, cada uma com login próprio.** O layout pode ser 2×2, 1 grande + 3 pequenas ou 4 lado a lado, com divisórias ajustáveis e zoom por conta.
- **Não deixa o jogo desacelerar** quando a janela está minimizada. O X esconde o app na bandeja, e as contas continuam rodando.
- **Alertas:** shiny visto ou capturado, capturas, desmaio, boss, item vendido no Market, pokébolas acabando e conta travada. Os alertas aparecem como notificação do Windows, com sons próprios.
- **💸 Aviso de preço bom no Mercado:** você cria regras ("Fire Stone até 500", "qualquer item abaixo de 70% da média", "Pikachu shiny até 10.000") e o MultiIdle avisa quando aparecer, pelos anúncios com alto-falante e pelo menor preço da vitrine. Ele só avisa: a compra é sua, pelo jogo.
- **📺 Lives parceiras da Twitch:** a lista das lives oficiais do PokeIdle, no mesmo visual do jogo, com o bônus de cada conta. Um clique abre a live no seu navegador, e um alerta avisa quando uma live com bônus começa.
- **Recarrega sozinho** a conta que travar e aperta o "Recarregar agora" quando o jogo atualiza.
- **🍃 Modo Economia** do próprio jogo, numa conta ou em todas, para pesar menos no PC.
- **📱 Painel no celular:** nível, equipe com HP, sessão por hora, pokébolas, loja, tela ao vivo e alertas. Ele vem **desligado**. Para ligar, clique em **📱 Celular** no topo.
  - Em casa, leia o QR code com o celular.
  - Fora de casa, instale o [Tailscale](https://tailscale.com/download) no PC e no celular, com a mesma conta. O QR de "fora de casa" aparece sozinho.

## O que ele NÃO faz
Ele não joga por você: não captura, não ataca e não joga pokébolas sozinho. Ele só mostra as contas e lê o que o jogo informa. A única coisa que ele envia ao jogo é a **compra na loja**, quando **você** confirma no celular, e é a mesma mensagem que o botão da loja do jogo manda.

## Para quem desenvolve
```
npm install
npm start          # ou MultiIdle.bat
npm run testes     # auto-testes da leitura dos eventos e do estado do jogo
npm run build      # gera o instalador em dist/ (sem publicar)
```
Para publicar uma versão nova, use `Publicar-Atualizacao.bat`. Ele precisa da variável de ambiente `GH_TOKEN`, e o passo a passo está dentro do arquivo.

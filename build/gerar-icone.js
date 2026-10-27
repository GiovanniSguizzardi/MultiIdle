// Gera build/icon.png (512×512) — o ícone do MultiIdle: moldura de madeira com as 4 contas (telinhas
// em xadrez azul) e "MI" dourado no meio. Rodar: node_modules\electron\dist\electron.exe build\gerar-icone.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const html = `<!doctype html><body style="margin:0;background:transparent"><canvas id="c" width="512" height="512"></canvas><script>
const c = document.getElementById('c').getContext('2d');
const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
// madeira (mesmas cores do tema)
rr(8, 8, 496, 496, 88); c.fillStyle = '#480e1e'; c.fill();
rr(20, 20, 472, 472, 78); c.fillStyle = '#f1d3b7'; c.fill();
rr(30, 30, 452, 452, 70);
const g = c.createLinearGradient(0, 30, 0, 482);
g.addColorStop(0, '#914850'); g.addColorStop(.12, '#bd6951'); g.addColorStop(.85, '#bd6951'); g.addColorStop(.93, '#df824c'); g.addColorStop(1, '#bd6951');
c.fillStyle = g; c.fill();
// as 4 telinhas
const pos = [[66, 66], [266, 66], [66, 266], [266, 266]];
for (const [x, y] of pos) {
  rr(x - 6, y - 6, 192, 192, 26); c.fillStyle = '#480e1e'; c.fill();
  c.save(); rr(x, y, 180, 180, 20); c.clip();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { c.fillStyle = (i + j) % 2 ? '#587aff' : '#3357e3'; c.fillRect(x + i * 30, y + j * 30, 30, 30); }
  c.restore();
}
// medalha dourada com "MI"
c.beginPath(); c.arc(256, 256, 112, 0, 7); c.fillStyle = '#480e1e'; c.fill();
c.beginPath(); c.arc(256, 256, 100, 0, 7); c.fillStyle = '#7d5313'; c.fill();
c.beginPath(); c.arc(256, 256, 90, 0, 7);
const o = c.createLinearGradient(0, 166, 0, 346); o.addColorStop(0, '#ffe9a3'); o.addColorStop(.5, '#e2a93f'); o.addColorStop(1, '#b57a1e');
c.fillStyle = o; c.fill();
c.font = '900 104px Tahoma, Verdana, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
c.lineWidth = 14; c.strokeStyle = '#480e1e'; c.lineJoin = 'round'; c.strokeText('MI', 256, 262);
c.fillStyle = '#fff6ef'; c.fillText('MI', 256, 262);
window.png = document.getElementById('c').toDataURL('image/png');
</script></body>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 512, height: 512 });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const dataUrl = await w.webContents.executeJavaScript('window.png');
  fs.writeFileSync(`${__dirname}/icon.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('ok', `${__dirname}/icon.png`);
  app.quit();
});

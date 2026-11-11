// Simula uma mensagem da Evolution API para testar o bot sem celular.
// Uso: node --env-file=.env scripts/simular-mensagem.mjs <numero> "<texto>" [--audio] [--imagem]
// O número deve começar com 5500 (fictício): o bot não envia nada de verdade para esses números.
// As respostas são lidas da tabela "resposta" do Postgres.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [numero, texto = ''] = args.filter((a) => !a.startsWith('--'));
if (!numero) {
  console.error('Uso: node --env-file=.env scripts/simular-mensagem.mjs <numero 5500...> "<texto>" [--audio] [--imagem]');
  process.exit(1);
}
if (!numero.startsWith('5500')) {
  console.error('Use um número fictício começando com 5500 (ex.: 5500000000001) para não enviar WhatsApp de verdade.');
  process.exit(1);
}

const porta = process.env.BOT_PORT || 3000;
const caminho = new URL(process.env.BOT_WEBHOOK_URL).pathname;
const id = 'SIM' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();

let message;
if (flags.includes('--audio')) message = { audioMessage: { seconds: 5 } };
else if (flags.includes('--imagem')) message = { imageMessage: {} };
else message = { conversation: texto };

const payload = {
  event: 'messages.upsert',
  instance: process.env.EVOLUTION_INSTANCE,
  data: { key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id }, pushName: 'Simulado', message },
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const t0 = Date.now();
const r = await fetch(`http://localhost:${porta}${caminho}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
if (!r.ok) { console.error(`Bot respondeu HTTP ${r.status}`); await pool.end(); process.exit(1); }

// Espera as respostas aparecerem (estabiliza quando não chega nada novo por 800 ms)
let respostas = [];
let ultimaMudanca = Date.now();
while (Date.now() - t0 < 12000) {
  const q = await pool.query('SELECT intencao, texto, latencia_ms FROM resposta WHERE message_id = $1 ORDER BY id', [id]);
  if (q.rowCount !== respostas.length) { respostas = q.rows; ultimaMudanca = Date.now(); }
  if (respostas.length && Date.now() - ultimaMudanca > 800) break;
  await new Promise((ok) => setTimeout(ok, 150));
}

const rotulo = flags.includes('--audio') ? '[áudio]' : flags.includes('--imagem') ? '[imagem]' : texto;
console.log(`\n>>> ${numero}: ${rotulo}`);
if (!respostas.length) console.log('(sem resposta: mensagem ignorada, duplicada ou limite já avisado)');
for (const x of respostas) console.log(`<<< [${x.intencao}, ${x.latencia_ms}ms]\n${x.texto}\n`);
await pool.end();

// Biblioteca do simulador: manda mensagens da Evolution falsas ao bot e lê as respostas no Postgres.
// Usada por simular-mensagem.mjs (linha de comando) e regressao.mjs. Requer o .env carregado (node --env-file=.env).

import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export function novoId() {
  return 'SIM' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
}

// Envia uma mensagem. opcoes: { audio, imagem, id }. Devolve o id da mensagem.
export async function enviar(numero, texto, opcoes = {}) {
  if (!String(numero).startsWith('5500')) throw new Error('Use um número fictício começando com 5500 (nada é enviado de verdade).');
  const id = opcoes.id || novoId();
  const message = opcoes.audio ? { audioMessage: { seconds: 5 } } : opcoes.imagem ? { imageMessage: {} } : { conversation: texto };
  const caminho = new URL(process.env.BOT_WEBHOOK_URL).pathname;
  const r = await fetch(`http://localhost:${process.env.BOT_PORT || 3000}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      instance: process.env.EVOLUTION_INSTANCE,
      data: { key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id }, pushName: 'Simulado', message },
    }),
  });
  if (!r.ok) throw new Error(`Bot respondeu HTTP ${r.status}`);
  return id;
}

// Espera as respostas de uma ou mais mensagens (com o debounce, as respostas ficam ligadas à última do grupo).
// Termina quando passa `quietoMs` sem resposta nova, ou no limite.
export async function esperarRespostas(ids, { quietoMs = 1500, limiteMs = 40000 } = {}) {
  const lista = Array.isArray(ids) ? ids : [ids];
  const t0 = Date.now();
  let respostas = [];
  let ultimaMudanca = Date.now();
  while (Date.now() - t0 < limiteMs) {
    const q = await pool.query('SELECT intencao, texto, latencia_ms FROM resposta WHERE message_id = ANY($1) ORDER BY id', [lista]);
    if (q.rowCount !== respostas.length) { respostas = q.rows; ultimaMudanca = Date.now(); }
    if (respostas.length && Date.now() - ultimaMudanca > quietoMs) break;
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return respostas;
}

// Envia e espera a resposta (uma mensagem por vez)
export async function conversar(numero, texto, opcoes) {
  const id = await enviar(numero, texto, opcoes);
  return esperarRespostas(id, opcoes);
}

export async function limpar(prefixoOuNumero) {
  const p = `${prefixoOuNumero}%`;
  await pool.query('DELETE FROM resposta WHERE numero LIKE $1', [p]);
  await pool.query('DELETE FROM mensagem WHERE numero LIKE $1', [p]);
  await pool.query('DELETE FROM conversa WHERE numero LIKE $1', [p]);
}

export async function fechar() {
  await pool.end();
}

// Bot do Núcleo: recebe o webhook da Evolution, responde 200 na hora e processa em fila por número.
// Uso: npm run bot   (lê o .env com --env-file)

const http = require('node:http');
const { processar, DEBOUNCE_MS, DEBOUNCE_MAX_MS } = require('./processar');
const { enfileirar } = require('./fila');
const { normalizar } = require('./normalizar');
const { listaPermitida } = require('./acesso');

const PORTA = Number(process.env.BOT_PORT) || 3000;
const CAMINHO = (() => {
  try { return new URL(process.env.BOT_WEBHOOK_URL).pathname; } catch { return null; }
})();
if (!CAMINHO || /TROQUE/.test(CAMINHO)) {
  console.error('BOT_WEBHOOK_URL ausente ou com sufixo de exemplo no .env. Abortando.');
  process.exit(1);
}


function lerCorpo(req, limite = 1_000_000) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) { reject(new Error('corpo grande demais')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function responderJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const servidor = http.createServer(async (req, res) => {
  const caminho = (req.url || '').split('?')[0];
  if (req.method === 'GET' && caminho === '/health') return responderJson(res, 200, { ok: true });
  if (req.method !== 'POST' || caminho !== CAMINHO) return responderJson(res, 404, { ok: false });
  try {
    const evento = JSON.parse((await lerCorpo(req)) || '{}');
    responderJson(res, 200, { ok: true }); // responde antes de processar
    const m = normalizar(evento);
    if (m) enfileirar(m.numero || m.message_id, () => processar(evento));
  } catch (e) {
    if (!res.headersSent) responderJson(res, 400, { ok: false });
    console.error('[webhook] corpo inválido:', e.message);
  }
});

process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

servidor.listen(PORTA, '0.0.0.0', () => {
  const so = listaPermitida();
  if (so.length) console.warn(`*** MODO TESTE: respondendo só a ${so.join(', ')}. Esvazie BOT_SOMENTE_NUMEROS no .env quando o MVP estiver funcional. ***`);
  console.log(`Agrupamento de mensagens: janela de ${DEBOUNCE_MS} ms, máximo de ${DEBOUNCE_MAX_MS} ms (DEBOUNCE_MS e DEBOUNCE_MAX_MS no .env)`);
  console.log(`Bot no ar em http://0.0.0.0:${PORTA}  (health: /health)  webhook: ${CAMINHO}`);
});

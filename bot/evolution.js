// Cliente mínimo da Evolution API.
// Números fictícios (prefixo 5500, DDD inexistente) usados nos testes nunca são enviados de verdade.

const PREFIXO_SIMULADO = '5500';

function ehSimulado(numero) {
  return String(numero).startsWith(PREFIXO_SIMULADO);
}

async function enviarTexto(numero, texto) {
  if (ehSimulado(numero)) return { simulado: true };
  const url = `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ number: String(numero), text: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`sendText HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { simulado: false };
}

module.exports = { enviarTexto, ehSimulado, PREFIXO_SIMULADO };

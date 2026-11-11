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

// "Digitando..." no WhatsApp (POST /chat/sendPresence/{instance}, conferida na v2.3.7). Quem chama ignora falhas.
async function enviarPresenca(numero, delayMs) {
  if (ehSimulado(numero)) return { simulado: true };
  const url = `${process.env.EVOLUTION_URL}/chat/sendPresence/${process.env.EVOLUTION_INSTANCE}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ number: String(numero), presence: 'composing', delay: Math.round(delayMs) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`sendPresence HTTP ${r.status}`);
  return { simulado: false };
}

// Baixa o áudio recebido: { base64, mimetype }. Usa o base64 do próprio webhook quando a Evolution o enviou
// (alternativa ao erro 400 de áudio de iPhone, issue #2550); senão getBase64FromMediaMessage.
async function baixarMidia(m) {
  if (m.base64) return { base64: m.base64, mimetype: m.mimetype || 'audio/ogg' };
  const url = `${process.env.EVOLUTION_URL}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ message: { key: { id: m.message_id } }, convertToMp4: false }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`getBase64FromMediaMessage HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (!j || !j.base64) throw new Error('getBase64FromMediaMessage sem base64');
  return { base64: String(j.base64).replace(/^data:[^,]*,/, ''), mimetype: j.mimetype || 'audio/ogg' };
}

// Nota de voz (base64). `encoding: true` pede à Evolution para converter em ogg/opus.
async function enviarAudio(numero, base64) {
  if (ehSimulado(numero)) return { simulado: true };
  const url = `${process.env.EVOLUTION_URL}/message/sendWhatsAppAudio/${process.env.EVOLUTION_INSTANCE}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
    body: JSON.stringify({ number: String(numero), audio: base64, encoding: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`sendWhatsAppAudio HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { simulado: false };
}

module.exports = { baixarMidia, enviarAudio, enviarTexto, enviarPresenca, ehSimulado, PREFIXO_SIMULADO };

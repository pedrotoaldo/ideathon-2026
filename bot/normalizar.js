// Transforma o evento MESSAGES_UPSERT da Evolution API em um objeto simples.

const TIPOS_MIDIA_RESPONDIVEIS = [
  'imageMessage', 'videoMessage', 'stickerMessage', 'documentMessage',
  'contactMessage', 'locationMessage', 'liveLocationMessage', 'ptvMessage',
];

function soDigitos(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function mascarar(numero) {
  const n = String(numero || '');
  if (n.length <= 6) return '*'.repeat(n.length);
  return n.slice(0, 4) + '*'.repeat(n.length - 6) + n.slice(-2);
}

// Retorna null se o evento não é uma mensagem. tipo: texto | audio | midia | ignorar
function normalizar(evento) {
  if (!evento || typeof evento !== 'object') return null;
  if (!/messages[._]upsert/i.test(String(evento.event || ''))) return null;
  const d = Array.isArray(evento.data) ? evento.data[0] : evento.data;
  const key = d && d.key;
  if (!key || !key.id || !key.remoteJid) return null;

  const jid = String(key.remoteJid);
  // Contas com @lid: usa o número real quando a Evolution informa
  const jidReal = jid.endsWith('@lid') ? (key.remoteJidAlt || key.senderPn || d.senderPn || jid) : jid;
  const msg = d.message || {};
  const chaves = Object.keys(msg);

  let tipo = 'ignorar';
  let texto = '';
  if (typeof msg.conversation === 'string') {
    tipo = 'texto'; texto = msg.conversation;
  } else if (msg.extendedTextMessage && typeof msg.extendedTextMessage.text === 'string') {
    tipo = 'texto'; texto = msg.extendedTextMessage.text;
  } else if (msg.audioMessage) {
    tipo = 'audio';
  } else if (chaves.some((c) => TIPOS_MIDIA_RESPONDIVEIS.includes(c))) {
    tipo = 'midia';
  }

  return {
    message_id: String(key.id),
    numero: soDigitos(jidReal),
    destino: soDigitos(jidReal), // para onde enviar a resposta
    fromMe: !!key.fromMe,
    isGroup: jid.endsWith('@g.us'),
    isStatus: jid === 'status@broadcast',
    tipo,
    texto: texto.trim(),
    duracao_audio: msg.audioMessage ? Number(msg.audioMessage.seconds) || null : null,
  };
}

module.exports = { normalizar, mascarar, soDigitos };

const test = require('node:test');
const assert = require('node:assert');
const { normalizar, mascarar } = require('./normalizar');

const base = (msg, key = {}) => ({
  event: 'messages.upsert',
  data: { key: { remoteJid: '554499999999@s.whatsapp.net', fromMe: false, id: 'ABC', ...key }, message: msg },
});

test('texto simples e extendedTextMessage', () => {
  const a = normalizar(base({ conversation: ' oi ' }));
  assert.equal(a.tipo, 'texto');
  assert.equal(a.texto, 'oi');
  assert.equal(a.numero, '554499999999');
  assert.equal(normalizar(base({ extendedTextMessage: { text: 'menu' } })).texto, 'menu');
});

test('áudio, mídia e tipos ignorados', () => {
  assert.equal(normalizar(base({ audioMessage: { seconds: 7 } })).tipo, 'audio');
  assert.equal(normalizar(base({ imageMessage: {} })).tipo, 'midia');
  assert.equal(normalizar(base({ reactionMessage: {} })).tipo, 'ignorar');
});

test('fromMe, grupo e status', () => {
  assert.equal(normalizar(base({ conversation: 'x' }, { fromMe: true })).fromMe, true);
  assert.equal(normalizar(base({ conversation: 'x' }, { remoteJid: '1203@g.us' })).isGroup, true);
  assert.equal(normalizar(base({ conversation: 'x' }, { remoteJid: 'status@broadcast' })).isStatus, true);
});

test('eventos que não são mensagem viram null', () => {
  assert.equal(normalizar({ event: 'connection.update', data: {} }), null);
  assert.equal(normalizar(null), null);
  assert.equal(normalizar({ event: 'messages.upsert', data: {} }), null);
});

test('@lid usa o número real quando informado', () => {
  const m = normalizar(base({ conversation: 'oi' }, { remoteJid: '123@lid', remoteJidAlt: '554488887777@s.whatsapp.net' }));
  assert.equal(m.numero, '554488887777');
});

test('número mascarado', () => {
  assert.equal(mascarar('554499364910'), '5544******10');
  assert.equal(mascarar('123'), '***');
});

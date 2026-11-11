const test = require('node:test');
const assert = require('node:assert/strict');
const { audioAtivo, transcrever, sintetizar, paraFala, escolherFala, extensao } = require('./audio');
const { tratar } = require('./cerebro');
const { rotear } = require('./roteador');
const { normalizar } = require('./normalizar');

process.env.AUDIO_API_KEY = 'chave-de-teste';
process.env.AUDIO_BASE_URL = 'https://audio.exemplo/v1/';
process.env.AUDIO_MODEL_TRANSCRICAO = 'whisper-1';
process.env.AUDIO_MODEL_TTS = 'gpt-4o-mini-tts';

test('AUDIO_ATIVO só liga com "true" e chave preenchida', () => {
  assert.equal(audioAtivo({ AUDIO_ATIVO: 'true', AUDIO_API_KEY: 'x' }), true);
  assert.equal(audioAtivo({ AUDIO_ATIVO: 'TRUE', AUDIO_API_KEY: 'x' }), true);
  assert.equal(audioAtivo({ AUDIO_ATIVO: 'false', AUDIO_API_KEY: 'x' }), false);
  assert.equal(audioAtivo({ AUDIO_ATIVO: 'true', AUDIO_API_KEY: '' }), false);
  assert.equal(audioAtivo({}), false);
});

test('transcrever: multipart em português para /audio/transcriptions', async () => {
  let visto;
  const fetchFn = async (url, op) => { visto = { url, op }; return { ok: true, json: async () => ({ text: '  dez hectares de soja  ' }) }; };
  const t = await transcrever(Buffer.from('abc'), 'audio/ogg; codecs=opus', { fetchFn });
  assert.equal(t, 'dez hectares de soja');
  assert.equal(visto.url, 'https://audio.exemplo/v1/audio/transcriptions');
  assert.equal(visto.op.headers.Authorization, 'Bearer chave-de-teste');
  assert.equal(visto.op.body.get('language'), 'pt');
  assert.equal(visto.op.body.get('model'), 'whisper-1');
  assert.match(visto.op.body.get('prompt'), /sim, não, isso, pode/); // contexto para palavras curtas
  assert.match(visto.op.body.get('prompt'), /hectares, alqueires, sacas por hectare/);
  assert.equal(visto.op.body.get('file').name, 'audio.ogg');
});

test('sintetizar: sempre envia instructions (jovem, leve, sem tom maduro, de locutora ou de call center)', async () => {
  let corpo;
  const fetchFn = async (url, op) => { corpo = JSON.parse(op.body); return { ok: true, arrayBuffer: async () => Buffer.from('mp3') }; };
  await sintetizar('Olha, fiz a sua conta.', { fetchFn });
  assert.match(corpo.instructions, /^Voice: A young Brazilian woman in her mid-twenties, recently graduated, speaking Brazilian Portuguese/);
  assert.match(corpo.instructions, /never mature, never deep, never like a news anchor or a call center/);
  assert.match(corpo.instructions, /Smiling while she speaks/);
  assert.match(corpo.instructions, /Pronunciation: Clear and relaxed, everyday Brazilian Portuguese, not formal\.$/);
  assert.equal(corpo.model, 'gpt-4o-mini-tts');
});

test('transcrever: tenta de novo em 503 e desiste em 401', async () => {
  let n = 0;
  const f503 = async () => (++n === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ text: 'oi' }) });
  assert.equal(await transcrever(Buffer.from('a'), 'audio/ogg', { fetchFn: f503 }), 'oi');
  assert.equal(n, 2);
  n = 0;
  await assert.rejects(() => transcrever(Buffer.from('a'), 'audio/ogg', { fetchFn: async () => { n++; return { ok: false, status: 401 }; } }), /HTTP 401/);
  assert.equal(n, 1);
});

test('sintetizar: /audio/speech com voz, formato e instruções (gpt-4o) e devolve base64', async () => {
  let corpo, url;
  const fetchFn = async (u, op) => { url = u; corpo = JSON.parse(op.body); return { ok: true, arrayBuffer: async () => Buffer.from('AUDIO').buffer.slice(0, 5) }; };
  const b64 = await sintetizar('Olá', { fetchFn });
  assert.equal(url, 'https://audio.exemplo/v1/audio/speech');
  assert.equal(corpo.input, 'Olá');
  assert.equal(corpo.model, 'gpt-4o-mini-tts');
  assert.ok(corpo.voice);
  assert.match(corpo.instructions, /português do Brasil/);
  assert.equal(typeof b64, 'string');
  assert.ok(b64.length > 0);
});

test('escolherFala: resumo falado da conta; outros textos só até 400 caracteres; fixos nunca', () => {
  assert.equal(escolherFala([{ texto: 'Pela sua conta: ...', intencao: 'safra', falado: 'Fiz a sua conta.' }, { texto: 'Quer testar?', intencao: 'safra' }]), 'Fiz a sua conta.');
  assert.equal(escolherFala([{ texto: 'CBS é federal.', intencao: 'tributario' }]), 'CBS é federal.');
  assert.equal(escolherFala([{ texto: 'x'.repeat(401), intencao: 'tributario' }]), null);
  assert.equal(escolherFala([{ texto: 'Como posso ajudar?', intencao: 'menu' }]), null);
  assert.equal(escolherFala([{ texto: 'Eu só ajudo com...', intencao: 'fora_escopo' }]), null);
  assert.equal(escolherFala([{ texto: 'Entendi: 10 ha, custo de R$ 45.000, 60 sacas/ha.\nEstá certo?', intencao: 'safra' }]),
    'Entendi: 10 hectares, custo de 45.000 reais, 60 sacas por hectare. Está certo?');
});

test('paraFala troca siglas e símbolos sem mudar os números', () => {
  assert.equal(paraFala('R$ 93,75/saca • 45 sc/ha'), '93,75 reais/saca 45 sacas por hectare');
});

test('extensao pelo mimetype', () => {
  assert.equal(extensao('audio/ogg; codecs=opus'), 'ogg');
  assert.equal(extensao('audio/mpeg'), 'mp3');
  assert.equal(extensao('audio/mp4'), 'm4a');
});

// ---------- comandos e normalização ----------
const semLlm = async () => { throw new Error('sem LLM'); };
const passo = async (conv, texto, deps = {}) => {
  const r = await tratar(conv, texto, { extrair: semLlm, ...deps });
  return { r, texto: r.respostas.map((x) => x.texto).join('\n') };
};

test('"manda em áudio" e "só texto" (inclusive dentro de um fluxo) ligam e desligam', async () => {
  assert.equal(rotear('só texto', 'coletando_safra').intencao, 'audio');
  assert.equal(rotear('manda em áudio', 'menu').intencao, 'audio');
  let p = await passo({ estado: 'menu', dados: {} }, 'manda em áudio', { audioAtivo: true });
  assert.equal(p.r.responde_audio, true);
  assert.match(p.texto, /vou responder em áudio também/);
  p = await passo({ estado: 'coletando_safra', dados: { safra: {} } }, 'só texto', { audioAtivo: true });
  assert.equal(p.r.responde_audio, false);
  assert.match(p.texto, /só texto/);
  assert.equal(p.r.estado, 'coletando_safra');
});

test('com o áudio desligado (AUDIO_ATIVO=false) os comandos respondem AUDIO_AINDA_NAO', async () => {
  const p = await passo({ estado: 'menu', dados: {} }, 'manda em áudio', { audioAtivo: false });
  assert.match(p.texto, /Por enquanto eu entendo só texto/);
  assert.equal(p.r.responde_audio, undefined);
});

test('a conta da safra traz o texto falado (montarResumoFalado) na resposta do resultado', async () => {
  const safra = { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 };
  const p = await passo({ estado: 'confirmando_safra', dados: { safra } }, 'sim');
  const res = p.r.respostas.find((x) => x.falado);
  assert.match(res.falado, /^Olha, fiz a sua conta/);
  assert.match(res.falado, /quarenta e cinco sacas por hectare/);
  assert.match(res.texto, /Pela sua conta/);
});

test('normalizar: áudio traz duração, mimetype e base64 do webhook', () => {
  const m = normalizar({ event: 'messages.upsert', data: { key: { id: 'A1', remoteJid: '5544999999999@s.whatsapp.net', fromMe: false }, message: { audioMessage: { seconds: 7, mimetype: 'audio/ogg; codecs=opus' }, base64: 'QUJD' } } });
  assert.equal(m.tipo, 'audio');
  assert.equal(m.duracao_audio, 7);
  assert.equal(m.base64, 'QUJD');
  assert.equal(m.mimetype, 'audio/ogg; codecs=opus');
});

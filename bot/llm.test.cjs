const test = require('node:test');
const assert = require('node:assert/strict');
const { chatJson, LlmIndisponivel } = require('./llm');

process.env.LLM_BASE_URL = 'https://exemplo.test/v1beta/openai/';
process.env.LLM_API_KEY = 'chave-falsa';
process.env.LLM_MODEL_CHAT = 'modelo-falso';

const ok = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });
const http = (status) => ({ ok: false, status, text: async () => 'erro' });

test('503 duas vezes e sucesso na terceira tentativa', async () => {
  const respostas = [http(503), http(503), ok({ a: 1 })];
  const urls = [];
  const fetchFn = async (url) => { urls.push(url); return respostas.shift(); };
  assert.deepEqual(await chatJson({ system: 's', user: 'u', fetchFn }), { a: 1 });
  assert.equal(urls.length, 3);
  assert.equal(urls[0], 'https://exemplo.test/v1beta/openai/chat/completions'.replace('openai/chat', 'openai/chat'));
});

test('503 em todas as tentativas vira LlmIndisponivel (1 chamada + 2 novas)', async () => {
  let n = 0;
  await assert.rejects(chatJson({ system: 's', user: 'u', fetchFn: async () => { n++; return http(503); } }), LlmIndisponivel);
  assert.equal(n, 3);
});

test('timeout é tentado de novo', async () => {
  let n = 0;
  const fetchFn = async () => {
    n++;
    if (n < 3) { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }
    return ok({ b: 2 });
  };
  assert.deepEqual(await chatJson({ system: 's', user: 'u', fetchFn }), { b: 2 });
  assert.equal(n, 3);
});

test('erro definitivo (401) não é tentado de novo', async () => {
  let n = 0;
  await assert.rejects(chatJson({ system: 's', user: 'u', fetchFn: async () => { n++; return http(401); } }), LlmIndisponivel);
  assert.equal(n, 1);
});

test('resposta que não é JSON devolve null (sem derrubar)', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'oi' } }] }) });
  assert.equal(await chatJson({ system: 's', user: 'u', fetchFn }), null);
});

test('modelo que recusa temperature 0: refaz sem o campo', async () => {
  const corpos = [];
  const respostas = [{ ok: false, status: 400, text: async () => "Unsupported value: 'temperature' does not support 0" }, ok({ c: 3 })];
  const fetchFn = async (_u, opts) => { corpos.push(JSON.parse(opts.body)); return respostas.shift(); };
  assert.deepEqual(await chatJson({ system: 's', user: 'u', fetchFn }), { c: 3 });
  assert.equal(corpos[0].temperature, 0);
  assert.equal('temperature' in corpos[1], false);
});

test('duas chamadas simultâneas recusadas por causa da temperatura: as duas se recuperam', async () => {
  delete process.env.LLM_TEMPERATURE;
  // o módulo guarda a flag entre chamadas: força o estado "ainda manda temperatura" recarregando o módulo
  delete require.cache[require.resolve('./llm')];
  const fresco = require('./llm');
  const fetchFn = async (_u, opts) => {
    await new Promise((r) => setTimeout(r, 20));
    if ('temperature' in JSON.parse(opts.body)) return { ok: false, status: 400, text: async () => "Unsupported value: 'temperature'" };
    return ok({ d: 4 });
  };
  const [a, b] = await Promise.all([fresco.chatJson({ system: 's', user: 'u', fetchFn }), fresco.chatJson({ system: 's', user: 'u', fetchFn })]);
  assert.deepEqual([a, b], [{ d: 4 }, { d: 4 }]);
});

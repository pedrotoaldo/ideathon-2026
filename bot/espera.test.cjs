const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAvisoDeEspera, msDoEnv } = require('./espera');
const { dividirResposta } = require('./mensagens');
const T = require('./textos');
const S = require('../src/calc/safra.cjs');
const { tratar } = require('./cerebro');

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('espera: texto fixo e curto, nunca gerado pela IA', () => {
  assert.equal(T.ESPERA, 'Só um instante, já te respondo.');
  assert.match(T.ERRO_TEMPORARIO, /escreva "3" para falar com uma pessoa/);
});

test('espera: resposta lenta recebe o aviso uma vez; resposta rápida não recebe nada', async () => {
  const enviados = [];
  const avisados = new Set();
  const lento = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 30, avisados });
  lento.iniciar(['m1']);
  await dormir(90);
  lento.cancelar();
  assert.deepEqual(enviados, [T.ESPERA]);

  const rapido = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 40, avisados });
  rapido.iniciar(['m2']);
  await dormir(10);
  rapido.cancelar(); // a resposta chegou antes do limite
  await dormir(80);
  assert.equal(enviados.length, 1);
});

test('espera: no máximo um aviso por mensagem do produtor (mesmo id, mesmo com nova tentativa)', async () => {
  const enviados = [];
  const avisados = new Set();
  const a = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 20, avisados });
  a.iniciar(['audio1']); // transcrição lenta
  await dormir(60);
  const b = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 20, avisados });
  b.iniciar(['audio1']); // a mesma mensagem, agora na resposta
  await dormir(60);
  assert.equal(enviados.length, 1);
  // grupo com uma mensagem nova: ainda recebe o seu
  const c = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 20, avisados });
  c.iniciar(['audio1', 'texto2']);
  await dormir(60);
  assert.equal(enviados.length, 1); // 'audio1' já foi avisada: o grupo inteiro fica sem novo aviso
  const d = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 20, avisados });
  d.iniciar(['texto3']);
  await dormir(60);
  assert.equal(enviados.length, 2);
});

test('espera: ms 0 desliga; erro ao enviar o aviso não derruba nada; ESPERA_MS padrão 3000', async () => {
  const enviados = [];
  const off = criarAvisoDeEspera({ enviar: async (t) => { enviados.push(t); }, ms: 0, avisados: new Set() });
  off.iniciar(['x']);
  await dormir(30);
  assert.equal(enviados.length, 0);
  const quebra = criarAvisoDeEspera({ enviar: async () => { throw new Error('rede'); }, ms: 10, avisados: new Set() });
  const antes = console.error;
  console.error = () => {};
  quebra.iniciar(['y']);
  await dormir(40);
  console.error = antes;
  assert.equal(msDoEnv(undefined), 3000);
  assert.equal(msDoEnv(''), 3000);
  assert.equal(msDoEnv('1500'), 1500);
  assert.equal(msDoEnv('0'), 0);
});

test('mensagens: resposta curta vai inteira; longa divide por parágrafo em até 3, sem cortar frase', () => {
  assert.deepEqual(dividirResposta('Oi. Tudo certo.'), ['Oi. Tudo certo.']);
  const par = (n) => `Parágrafo ${n}. ` + 'Esta frase tem 70 caracteres para encher o texto sem cortar nada, ok? '.repeat(2).trim();
  const longo = [1, 2, 3, 4, 5, 6].map(par).join('\n\n');
  assert.ok(longo.length > 600);
  const partes = dividirResposta(longo);
  assert.ok(partes.length >= 2 && partes.length <= 3, 'partes: ' + partes.length);
  assert.equal(partes.join('\n\n'), longo); // nada se perde nem se corta
  for (const p of partes.slice(0, -1)) assert.ok(p.length <= 600);
  for (const p of partes) assert.ok(/[.?]$/.test(p), 'termina em frase: ' + p.slice(-20));
});

test('mensagens: sem linha em branco divide nas quebras de linha; sem nenhuma quebra vai inteira; link e número ficam inteiros', () => {
  const linhas = Array.from({ length: 12 }, (_, i) => `• Item ${i + 1}: custo de R$ ${(i + 1) * 1000},50 por hectare, veja https://www.embrapa.br/soja/item-${i + 1}.`).join('\n');
  const partes = dividirResposta(linhas);
  assert.ok(partes.length >= 2 && partes.length <= 3);
  assert.equal(partes.join('\n'), linhas);
  for (const p of partes) for (const l of p.split('\n')) assert.match(l, /R\$ \d+\.?\d*,50 .*https:\/\/www\.embrapa\.br\/soja\/item-\d+\.$|R\$ \d+,50 .*item-\d+\.$/);
  const bloco = 'Texto sem nenhuma quebra de linha. '.repeat(30).trim();
  assert.deepEqual(dividirResposta(bloco), [bloco]);
  // muitos parágrafos: nunca passa de 3 mensagens
  const muitos = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i}: ` + 'x'.repeat(100)).join('\n\n');
  assert.equal(dividirResposta(muitos).length, 3);
});

test('conta da safra vai em duas mensagens: números principais e depois os cenários (mais a oferta)', async () => {
  const dados = { safra: { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 } };
  const r = await tratar({ estado: 'confirmando_safra', dados }, 'sim', { extrair: async () => ({ ext: {}, versao: 'x' }) });
  assert.equal(r.respostas.length, 3);
  assert.match(r.respostas[0].texto, /^Pela sua conta:/);
  assert.match(r.respostas[0].texto, /pelo menos 45 sacas\/ha/);
  assert.match(r.respostas[0].texto, /custo por saca é R\$ 75\./);
  assert.doesNotMatch(r.respostas[0].texto, /Cenários/);
  assert.match(r.respostas[1].texto, /^Cenários \(preço R\$ 100\):/);
  assert.match(r.respostas[1].texto, /Colhendo 20% menos: sobram R\$ 3\.000/);
  assert.match(r.respostas[1].texto, /não uma previsão\.$/);
  assert.equal(r.respostas[2].texto, T.OFERTA_PROXIMO);
  assert.ok(r.respostas[0].falado); // a voz fala o resumo antes das duas mensagens escritas
  assert.equal(r.respostas[1].falado, undefined);
  assert.equal([r.respostas[0].texto, r.respostas[1].texto].join('\n\n'), S.montarRespostaSafra(S.calcularSafra(r.dados.safra, S.CENARIOS_PADRAO)));
});

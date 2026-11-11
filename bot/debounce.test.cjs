const test = require('node:test');
const assert = require('node:assert/strict');
const { criarDebounce } = require('./debounce');

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function montar(ms, maxMs) {
  const grupos = [];
  const d = criarDebounce({ ms, maxMs, aoFechar: (chave, itens) => grupos.push({ chave, itens }) });
  return { d, grupos };
}

test('3 mensagens dentro da janela viram um grupo só, na ordem', async () => {
  const { d, grupos } = montar(120, 1000);
  d.adicionar('a', 'm1'); await esperar(40);
  d.adicionar('a', 'm2'); await esperar(40);
  d.adicionar('a', 'm3');
  await esperar(50);
  assert.equal(grupos.length, 0); // a janela reinicia a cada mensagem
  await esperar(150);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].itens, ['m1', 'm2', 'm3']);
});

test('intervalo maior que a janela gera grupos separados', async () => {
  const { d, grupos } = montar(80, 1000);
  d.adicionar('a', 'm1'); await esperar(160);
  d.adicionar('a', 'm2'); await esperar(160);
  assert.deepEqual(grupos.map((g) => g.itens), [['m1'], ['m2']]);
});

test('o limite máximo fecha o grupo mesmo com mensagens continuando', async () => {
  const { d, grupos } = montar(100, 250);
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) { d.adicionar('a', 'm' + i); await esperar(60); } // ~480 ms de mensagens seguidas
  await esperar(150);
  assert.ok(grupos.length >= 2, 'deveria ter fechado pelo limite: ' + grupos.length);
  assert.ok(grupos[0].itens.length < 8);
  assert.ok(Date.now() - t0 < 1500);
});

test('números diferentes não se misturam; cancelar descarta o grupo', async () => {
  const { d, grupos } = montar(60, 500);
  d.adicionar('a', 'a1'); d.adicionar('b', 'b1'); d.adicionar('a', 'a2');
  d.adicionar('c', 'c1'); d.cancelar('c');
  await esperar(150);
  assert.deepEqual(grupos.map((g) => [g.chave, g.itens]).sort(), [['a', ['a1', 'a2']], ['b', ['b1']]]);
  assert.equal(d.pendentes(), 0);
});

test('ms = 0 fecha na hora (debounce desligado)', async () => {
  const { d, grupos } = montar(0, 0);
  d.adicionar('a', 'm1'); d.adicionar('a', 'm2');
  await esperar(30);
  assert.ok(grupos.length >= 1);
});

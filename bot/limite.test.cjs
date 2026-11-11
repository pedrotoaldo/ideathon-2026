const test = require('node:test');
const assert = require('node:assert/strict');
const { registrar, _janelas } = require('./limite');

const LIM = { mensagens: 3, janela_min: 10 };

test('passa do limite na 4ª mensagem e avisa só uma vez por janela', () => {
  _janelas.clear();
  const t = 1_000_000;
  assert.equal(registrar('a', LIM, t).excedeu, false);
  assert.equal(registrar('a', LIM, t + 1).excedeu, false);
  assert.equal(registrar('a', LIM, t + 2).excedeu, false);
  const r4 = registrar('a', LIM, t + 3);
  assert.deepEqual(r4, { excedeu: true, avisar: true });
  assert.deepEqual(registrar('a', LIM, t + 4), { excedeu: true, avisar: false });
});

test('a janela desliza: depois de 10 min volta ao normal', () => {
  _janelas.clear();
  const t = 5_000_000;
  for (let i = 0; i < 5; i++) registrar('a', LIM, t + i);
  assert.equal(registrar('a', LIM, t + 11 * 60 * 1000).excedeu, false);
});

test('números diferentes têm contagens separadas', () => {
  _janelas.clear();
  for (let i = 0; i < 5; i++) registrar('a', LIM, 1000 + i);
  assert.equal(registrar('b', LIM, 1010).excedeu, false);
});

test('apagar dados no banco não mexe na contagem (módulo independente do banco)', () => {
  _janelas.clear();
  for (let i = 0; i < 4; i++) registrar('a', LIM, 2000 + i);
  // "apagar meus dados" só chama db.apagarDados; aqui nada é limpo
  assert.equal(registrar('a', LIM, 2010).excedeu, true);
});

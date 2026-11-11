const test = require('node:test');
const assert = require('node:assert/strict');
const { permitido, listaPermitida } = require('./acesso');

test('sem lista, todo mundo passa', () => {
  assert.equal(permitido('554488887777', ''), true);
});

test('com lista, só o número permitido (com ou sem o 9 depois do DDD)', () => {
  const env = '554499650506';
  assert.equal(permitido('554499650506', env), true);
  assert.equal(permitido('5544999650506', env), true);
  assert.equal(permitido('554488887777', env), false);
  assert.equal(permitido('554499364910', env), false);
});

test('números fictícios do simulador sempre passam; lista com vários números', () => {
  assert.equal(permitido('5500000000001', '554499650506'), true);
  assert.deepEqual(listaPermitida('554499650506, 554488887777'), ['554499650506', '554488887777']);
  assert.equal(permitido('554488887777', '554499650506, 554488887777'), true);
});

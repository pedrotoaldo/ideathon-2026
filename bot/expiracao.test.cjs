const test = require('node:test');
const assert = require('node:assert/strict');
const { expirou, reiniciarDados } = require('./expiracao');

const agora = Date.parse('2026-11-11T16:08:00Z');
const hAtras = (min) => new Date(agora - min * 60000).toISOString();

test('expirou: só depois de 30 min e nunca para novo nem para o alerta aguardando resposta', () => {
  assert.equal(expirou({ estado: 'coletando_safra', atualizado_em: hAtras(29) }, 30, agora), false);
  assert.equal(expirou({ estado: 'coletando_safra', atualizado_em: hAtras(31) }, 30, agora), true);
  assert.equal(expirou({ estado: 'resultado_safra', atualizado_em: hAtras(300) }, 30, agora), true);
  assert.equal(expirou({ estado: 'novo', atualizado_em: hAtras(300) }, 30, agora), false);
  assert.equal(expirou({ estado: 'aguardando_resposta_alerta', atualizado_em: hAtras(300) }, 30, agora), false);
  assert.equal(expirou({ estado: 'menu', atualizado_em: hAtras(300) }, 0, agora), false); // 0 desliga
});

test('reiniciarDados: descarta o fluxo e restaura a última conta, o perfil completo e o alerta', () => {
  const d = reiniciarDados({
    safra: { area_ha: 2 }, coleta: { pendente_area: 2 },
    ultimo_calculo: { cultura: 'soja', entrada: { area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 } },
    perfil: { perfil: 'nao_contribuinte', receita: 900000 }, alerta: { ativo: true, preco_alvo: 95 }, nao_sei: { pergunta: 'x' },
  });
  assert.deepEqual(d.safra, { area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100, cultura: 'soja' });
  assert.equal(d.coleta, undefined);
  assert.equal(d.perfil.perfil, 'nao_contribuinte');
  assert.equal(d.alerta.ativo, true);
  assert.equal(d.nao_sei, null);
  const sem = reiniciarDados({ safra: { area_ha: 2 }, perfil: { etapa: 'receita', tipo: 'pessoa_fisica' } });
  assert.equal(sem.safra, undefined);
  assert.equal(sem.perfil, undefined);
});

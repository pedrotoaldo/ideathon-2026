const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./safra.cjs');

const REF = { area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 };

test('exemplo de referência da SPEC (10 ha, R$ 45 mil, 60 sc/ha, R$ 100)', () => {
  const c = s.calcularSafra(REF);
  assert.equal(c.custo_ha, 4500);
  assert.equal(c.produtividade_minima, 45);
  assert.equal(c.preco_equilibrio, 75);
  assert.deepEqual(
    [c.cenarios.esperado.producao_sacas, c.cenarios.esperado.receita, c.cenarios.esperado.resultado, c.cenarios.esperado.custo_saca],
    [600, 60000, 15000, 75]
  );
  assert.deepEqual(
    [c.cenarios.desfavoravel.producao_sacas, c.cenarios.desfavoravel.receita, c.cenarios.desfavoravel.resultado, c.cenarios.desfavoravel.custo_saca],
    [480, 48000, 3000, 93.75]
  );
  assert.deepEqual(
    [c.cenarios.favoravel.producao_sacas, c.cenarios.favoravel.receita, c.cenarios.favoravel.resultado, c.cenarios.favoravel.custo_saca],
    [660, 66000, 21000, 68.18]
  );
});

test('resposta formatada traz mínimo, custo por saca e cenários', () => {
  const txt = s.montarRespostaSafra(s.calcularSafra(REF));
  assert.match(txt, /pelo menos 45 sacas\/ha/);
  assert.match(txt, /custo por saca é R\$ 75\b/);
  assert.match(txt, /Colhendo 20% menos: sobram R\$ 3\.000/);
  assert.match(txt, /Como espera: sobram R\$ 15\.000/);
  assert.match(txt, /Colhendo 10% mais: sobram R\$ 21\.000/);
});

test('e se colher 20% menos: responde "Não" primeiro (roteiro A, passo 5)', () => {
  const r = s.calcularESe(REF, { produtividade_pct: -20 });
  assert.equal(r.producao_sacas, 480);
  assert.equal(r.receita, 48000);
  assert.equal(r.resultado, 3000);
  assert.equal(r.custo_saca, 93.75);
  assert.match(s.montarRespostaESe(r), /^Não, ainda sobram R\$ 3\.000\./);
});

test('e se a saca for 70: faltam R$ 3.000 (roteiro A, passo 6)', () => {
  const r = s.calcularESe(REF, { preco: 70 });
  assert.equal(r.resultado, -3000);
  assert.match(s.montarRespostaESe(r), /^Sim, faltariam R\$ 3\.000\./);
});

test('alqueire paulista convertido (roteiro B)', () => {
  const d = s.mesclarExtracao({}, {
    cultura: 'soja', area_valor: 20, area_unidade: 'alqueire', custo_total: 180000,
    produtividade_valor: 60, produtividade_unidade: 'sc/ha', preco: 110,
  });
  assert.equal(d.area_ha, 48.4);
  const c = s.calcularSafra(d);
  assert.equal(c.produtividade_minima, 33.8);
  assert.equal(c.preco_equilibrio, 61.98);
  assert.equal(c.cenarios.esperado.resultado, 139440);
});

test('mescla não apaga campos já coletados com null', () => {
  const d = s.mesclarExtracao({ area_ha: 10, custo_total: 45000 }, { area_valor: null, custo_total: null, preco: 100 });
  assert.deepEqual([d.area_ha, d.custo_total, d.preco], [10, 45000, 100]);
  assert.deepEqual(s.camposFaltantes(d), ['produtividade']);
});

test('faixas plausíveis', () => {
  assert.deepEqual(s.camposForaDaFaixa({ area_ha: 10, custo_total: 45000, produtividade: 600, preco: 100 }), ['produtividade']);
  assert.deepEqual(s.camposForaDaFaixa(REF), []);
});

test('calcular sem campo obrigatório lança erro', () => {
  assert.throws(() => s.calcularSafra({ area_ha: 10 }), /Campos faltando/);
});

test('formatação em reais', () => {
  assert.equal(s.formatarReais(48000), 'R$ 48.000');
  assert.equal(s.formatarReais(93.75), 'R$ 93,75');
  assert.equal(s.formatarReais(1234567.5), 'R$ 1.234.567,50');
  assert.equal(s.textoResultado(-2500), 'faltam R$ 2.500');
});

test('perfil provável: não contribuinte, integrado, acima do limite, alertas', () => {
  assert.equal(s.perfilProvavel({ receita: 900000 }).perfil, 'nao_contribuinte');
  assert.equal(s.perfilProvavel({ receita: 900000, integrado: true }).perfil, 'integrado_nao_contribuinte');
  assert.equal(s.perfilProvavel({ receita: 4000000 }).perfil, 'contribuinte');
  const perto = s.perfilProvavel({ receita: 3000000, outra_empresa: true });
  assert.equal(perto.alertas.length, 2);
  for (const p of [s.perfilProvavel({ receita: 900000 }), perto]) {
    assert.doesNotMatch(p.texto, /\b(opte|é melhor|vale a pena)\b/i);
  }
});

test('resumo falado curto, sem listas', () => {
  const t = s.montarResumoFalado(s.calcularSafra(REF));
  assert.match(t, /pelo menos 45 sacas por hectare/);
  assert.match(t, /R\$ 75\b/);
  assert.match(t, /20 por cento menos, sobram R\$ 3\.000/);
  assert.doesNotMatch(t, /•/);
  assert.ok(t.length < 400);
});

test('gatilho de preço: dispara só para a cultura certa, ativo e com preço >= alvo', () => {
  const gatilhos = [
    { id: 1, cultura: 'soja', preco_alvo: 95, ativo: true },
    { id: 2, cultura: 'soja', preco_alvo: 120, ativo: true },
    { id: 3, cultura: 'milho', preco_alvo: 50, ativo: true },
    { id: 4, cultura: 'Soja', preco_alvo: 90, ativo: false },
  ];
  const disparados = s.avaliarGatilhos({ cultura: 'Soja', preco: 98 }, gatilhos).map((g) => g.id);
  assert.deepEqual(disparados, [1]);
  assert.deepEqual(s.avaliarGatilhos(null, gatilhos), []);
});

test('alerta de preço informa a sobra por saca e não recomenda vender', () => {
  const t = s.montarAlertaPreco({ cultura: 'soja', praca: 'cooperativa', preco_atual: 98, preco_alvo: 95, custo_saca: 75 });
  assert.match(t, /chegou a R\$ 98 hoje/);
  assert.match(t, /deixa cerca de R\$ 23/);
  assert.match(t, /A decisão de vender é sua/);
  assert.doesNotMatch(t, /\b(recomendo|venda agora|é melhor)\b/i);
  const abaixo = s.montarAlertaPreco({ cultura: 'soja', preco_atual: 70, preco_alvo: 65, custo_saca: 75 });
  assert.match(abaixo, /acima desse preço/);
});

test('validação do preço-alvo', () => {
  assert.equal(s.validarPrecoAlvo(110), true);
  assert.equal(s.validarPrecoAlvo(5), false);
  assert.equal(s.validarPrecoAlvo('110'), false);
});

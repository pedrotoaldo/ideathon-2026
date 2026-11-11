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

test('confirmação dos dados repete a entrada, com alqueire convertido', () => {
  const simples = s.montarConfirmacao({ cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 });
  assert.match(simples, /^Entendi: 10 ha de soja, custo de R\$ 45\.000, 60 sacas\/ha e saca a R\$ 100\./);
  assert.match(simples, /Responda "sim" ou me corrija/);
  const alq = s.montarConfirmacao({ cultura: 'soja', area_ha: 48.4, area_origem: { valor: 20, unidade: 'alqueire' }, custo_total: 180000, produtividade: 60, preco: 110 });
  assert.match(alq, /48,4 ha \(20 alqueires\) de soja/);
});


test('resultado fora do comum: custo por saca acima do dobro do preço ganha o aviso (caso 2 sc/ha do celular)', () => {
  const ruim = s.calcularSafra({ area_ha: 10, custo_total: 40000, produtividade: 2, preco: 60 });
  assert.equal(ruim.preco_equilibrio, 2000);
  assert.match(s.montarRespostaSafra(ruim), /Esse resultado ficou bem fora do comum\. Vale conferir os números\.$/);
  // exatamente o dobro não dispara; o exemplo de referência também não
  assert.doesNotMatch(s.montarRespostaSafra(s.calcularSafra({ area_ha: 10, custo_total: 12000, produtividade: 10, preco: 60 })), /fora do comum/);
  assert.doesNotMatch(s.montarRespostaSafra(s.calcularSafra(REF)), /fora do comum/);
});

test('faixa de produtividade por cultura: soja 20 a 90, milho 40 a 200, café 10 a 80; outras sem aviso', () => {
  const d = (cultura, produtividade) => ({ cultura, produtividade });
  assert.equal(s.avisoFaixaCultura(d('soja', 2)), 'Atenção: 2 sacas por hectare é bem abaixo do comum para soja. Está certo?');
  assert.match(s.avisoFaixaCultura(d('soja', 95)), /bem acima do comum para soja/);
  assert.equal(s.avisoFaixaCultura(d('soja', 60)), null);
  assert.match(s.avisoFaixaCultura(d('Milho', 30)), /abaixo do comum para Milho/);
  assert.equal(s.avisoFaixaCultura(d('Milho', 150)), null);
  assert.match(s.avisoFaixaCultura(d('café', 5)), /abaixo do comum/);
  assert.equal(s.avisoFaixaCultura(d('feijão', 1)), null);
  assert.equal(s.avisoFaixaCultura(d(null, 1)), null);
  // faixas vindas da config têm prioridade
  assert.equal(s.avisoFaixaCultura(d('soja', 2), { soja: { produtividade: [1, 90] } }), null);
});

test('confirmação com aviso exige "sim, está certo"', () => {
  const t = s.montarConfirmacao({ cultura: 'soja', area_ha: 10, custo_total: 40000, produtividade: 2, preco: 60 }, 'Atenção: 2 sacas por hectare é bem abaixo do comum para soja. Está certo?');
  assert.match(t, /Atenção: 2 sacas por hectare é bem abaixo do comum para soja\. Está certo\? Se estiver, responda "sim, está certo"/);
});

// ---------- montarResumo ----------
test('montarResumo: safra e perfil completos', () => {
  const t = s.montarResumo(
    { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 },
    { tipo: 'pessoa_fisica', receita: 900000, integrado: false, outra_empresa: false },
  );
  assert.equal(t, [
    'Resumo Agro na Medida',
    'Safra: 10 ha de soja, custo R$ 45.000, 60 sc/ha, saca R$ 100.',
    'Equilíbrio: 45 sc/ha ou R$ 75/saca. Resultado esperado: sobram R$ 15.000.',
    'Perfil informado: pessoa física, receita aprox. R$ 900.000, integrado: não, outra empresa: não.',
    'Perfil provável: não contribuinte, com possibilidade de optar pelo regime regular.',
    'Validar com o contador.',
  ].join('\n'));
});

test('montarResumo: só a safra, só o perfil e nenhum dos dois', () => {
  const safra = { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 };
  const perfil = { tipo: 'empresa', receita: 3000000, integrado: false, outra_empresa: true };
  const a = s.montarResumo(safra, null);
  assert.match(a, /Safra: 10 ha de soja/);
  assert.match(a, /Perfil: ainda não coletei\. Escreva "2"/);
  assert.match(a, /Validar com o contador\.$/);
  const b = s.montarResumo({ cultura: 'soja', area_ha: 10 }, perfil); // safra incompleta
  assert.match(b, /Safra: ainda não fiz a sua conta\. Escreva "1"/);
  assert.match(b, /empresa rural, receita aprox\. R\$ 3\.000\.000, integrado: não, outra empresa: sim/);
  assert.match(b, /perto do limite/); // alerta do perfilProvavel
  const c = s.montarResumo(undefined, undefined);
  assert.equal(c, 'Resumo Agro na Medida\nSafra: ainda não fiz a sua conta. Escreva "1" para fazer.\nPerfil: ainda não coletei. Escreva "2" para eu perguntar.');
});

test('montarResumo: perfil contribuinte e integrado', () => {
  assert.match(s.montarResumo(null, { tipo: 'empresa', receita: 4000000, integrado: false, outra_empresa: false }), /Perfil provável: contribuinte do IBS\/CBS/);
  assert.match(s.montarResumo(null, { tipo: 'pessoa_fisica', receita: 500000, integrado: true, outra_empresa: false }), /integrado, não contribuinte/);
});

// ---------- calcularCobertura ----------
test('calcularCobertura: parte do custo coberta, resto exposto', () => {
  const c = s.calcularCobertura({ custo_total: 45000, sacas_fixadas: 300, preco_fixado: 100, producao_sacas: 600 });
  assert.equal(c.receita_fixada, 30000);
  assert.equal(c.cobertura_pct, 66.7);
  assert.equal(c.custo_coberto, 30000);
  assert.equal(c.custo_descoberto, 15000);
  assert.equal(c.sacas_expostas, 300);
  assert.equal(c.preco_equilibrio_exposto, 50);
  assert.equal(c.cumpre_contratos, true);
  assert.equal(c.sacas_faltantes, 0);
});

test('calcularCobertura: custo 100% coberto (cobertura limitada a 100%)', () => {
  const c = s.calcularCobertura({ custo_total: 45000, sacas_fixadas: 600, preco_fixado: 100, producao_sacas: 600 });
  assert.equal(c.cobertura_pct, 100);
  assert.equal(c.custo_descoberto, 0);
  assert.equal(c.sacas_expostas, 0);
  assert.equal(c.preco_equilibrio_exposto, null);
  assert.equal(c.cumpre_contratos, true);
});

test('calcularCobertura: contrato maior que a produção não é cumprido', () => {
  const c = s.calcularCobertura({ custo_total: 45000, sacas_fixadas: 700, preco_fixado: 80, producao_sacas: 600 });
  assert.equal(c.cumpre_contratos, false);
  assert.equal(c.sacas_faltantes, 100);
  assert.equal(c.sacas_expostas, 0);
  assert.equal(c.cobertura_pct, 100); // 56.000 > 45.000
});

test('calcularCobertura: sem venda fixada e entradas inválidas', () => {
  const c = s.calcularCobertura({ custo_total: 45000, sacas_fixadas: 0, preco_fixado: 0, producao_sacas: 600 });
  assert.equal(c.cobertura_pct, 0);
  assert.equal(c.sacas_expostas, 600);
  assert.equal(c.preco_equilibrio_exposto, 75);
  assert.throws(() => s.calcularCobertura({ custo_total: 0, sacas_fixadas: 1, preco_fixado: 1, producao_sacas: 1 }));
  assert.throws(() => s.calcularCobertura({ custo_total: 100, sacas_fixadas: -1, preco_fixado: 1, producao_sacas: 1 }));
  assert.throws(() => s.calcularCobertura({ custo_total: 100, sacas_fixadas: 1, preco_fixado: 1, producao_sacas: NaN }));
});

test('avisosSanidade: números normais não geram aviso', () => {
  assert.deepEqual(s.avisosSanidade({ area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 }), []);
  assert.deepEqual(s.avisosSanidade({ area_ha: 40, custo_total: 40000, produtividade: 60, preco: 100 }), []); // R$ 1.000/ha, no limite
});

test('avisosSanidade: preço abaixo de R$ 30, custo por hectare fora da faixa e custo por saca acima de 2x o preço', () => {
  const a = s.avisosSanidade({ area_ha: 2, custo_total: 40000, produtividade: 10, preco: 10 });
  assert.equal(a.length, 3);
  assert.match(a[0], /saca a R\$ 10 é bem abaixo do comum/);
  assert.match(a[1], /R\$ 20\.000 por hectare.*entre R\$ 1\.000 e R\$ 15\.000/);
  assert.match(a[2], /custo por saca \(R\$ 2\.000\) ficou mais que o dobro do preço da saca \(R\$ 10\)/);
  assert.equal(s.avisosSanidade({ area_ha: 100, custo_total: 50000, produtividade: 60, preco: 100 }).length, 1); // R$ 500/ha
  assert.deepEqual(s.avisosSanidade({ area_ha: 10 }), []); // dados incompletos: sem aviso
  assert.equal(s.avisosSanidade({ area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 }, { preco_min: 150 }).length, 1); // limite vem da config
});

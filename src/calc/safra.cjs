// Agro na Medida ZAP — cálculo determinístico da safra e regra de perfil tributário.
// Sem dependências: importado pelo bot (bot/) com require; também colável num Code node do n8n (Plus 8, scripts/build-n8n.mjs).
// A IA nunca calcula: todo número mostrado ao produtor sai daqui.

const HA_POR_ALQUEIRE_PAULISTA = 2.42;

const CENARIOS_PADRAO = { desfavoravel_pct: -20, favoravel_pct: 10 };

const FAIXAS = {
  area_ha: [0.1, 100000],
  custo_total: [100, 500000000],
  produtividade: [1, 200],
  preco: [10, 1000],
};

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function converterAreaParaHa(valor, unidade) {
  if (valor == null) return null;
  if (unidade === 'alqueire') return round2(valor * HA_POR_ALQUEIRE_PAULISTA);
  return valor;
}

function converterProdutividadeParaScHa(valor, unidade) {
  if (valor == null) return null;
  if (unidade === 'sc/alqueire') return round2(valor / HA_POR_ALQUEIRE_PAULISTA);
  return valor;
}

// Mescla a extração do LLM nos dados já coletados (campos null não apagam o que existe).
function mesclarExtracao(dados, ext) {
  const d = { ...(dados || {}) };
  if (!ext) return d;
  if (ext.cultura) d.cultura = ext.cultura;
  if (ext.area_valor != null) {
    d.area_ha = converterAreaParaHa(ext.area_valor, ext.area_unidade);
    d.area_origem = ext.area_unidade === 'alqueire' ? { valor: ext.area_valor, unidade: 'alqueire' } : null;
  }
  if (ext.custo_total != null) d.custo_total = ext.custo_total;
  if (ext.produtividade_valor != null) {
    d.produtividade = converterProdutividadeParaScHa(ext.produtividade_valor, ext.produtividade_unidade);
  }
  if (ext.preco != null) d.preco = ext.preco;
  return d;
}

// Campos obrigatórios que faltam, na ordem em que devem ser perguntados.
function camposFaltantes(d) {
  const ordem = ['area_ha', 'custo_total', 'produtividade', 'preco'];
  return ordem.filter((c) => d == null || d[c] == null);
}

// Campos fora da faixa plausível (pede confirmação em vez de calcular).
function camposForaDaFaixa(d) {
  return Object.keys(FAIXAS).filter((c) => {
    const v = d && d[c];
    if (v == null) return false;
    const [min, max] = FAIXAS[c];
    return !(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max);
  });
}

function calcularCenario(area_ha, custo_total, produtividade, preco) {
  const producao_sacas = round2(area_ha * produtividade);
  const receita = round2(producao_sacas * preco);
  const resultado = round2(receita - custo_total);
  const custo_saca = producao_sacas > 0 ? round2(custo_total / producao_sacas) : null;
  return { produtividade: round2(produtividade), producao_sacas, receita, resultado, custo_saca };
}

function calcularSafra(d, cenarios = CENARIOS_PADRAO) {
  const faltam = camposFaltantes(d);
  if (faltam.length) throw new Error('Campos faltando: ' + faltam.join(', '));
  const { area_ha, custo_total, produtividade, preco } = d;
  const fator = (pct) => 1 + pct / 100;
  return {
    entrada: { area_ha, custo_total, produtividade, preco },
    custo_ha: round2(custo_total / area_ha),
    produtividade_minima: round1(custo_total / (area_ha * preco)),
    preco_equilibrio: round2(custo_total / (area_ha * produtividade)),
    cenarios: {
      desfavoravel: { pct: cenarios.desfavoravel_pct, ...calcularCenario(area_ha, custo_total, produtividade * fator(cenarios.desfavoravel_pct), preco) },
      esperado: { pct: 0, ...calcularCenario(area_ha, custo_total, produtividade, preco) },
      favoravel: { pct: cenarios.favoravel_pct, ...calcularCenario(area_ha, custo_total, produtividade * fator(cenarios.favoravel_pct), preco) },
    },
  };
}

// Aplica um "e se..." e devolve o cenário único recalculado.
function calcularESe(d, alteracao) {
  const a = alteracao || {};
  const novo = { ...d };
  if (a.preco != null) novo.preco = a.preco;
  if (a.custo_total != null) novo.custo_total = a.custo_total;
  if (a.produtividade_valor != null) novo.produtividade = a.produtividade_valor;
  let produtividade = novo.produtividade;
  if (a.produtividade_pct != null) produtividade = novo.produtividade * (1 + a.produtividade_pct / 100);
  const c = calcularCenario(novo.area_ha, novo.custo_total, produtividade, novo.preco);
  return { dados: novo, preco: novo.preco, ...c };
}

// ---------- Formatação para o WhatsApp ----------

function formatarNumero(n, casas) {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(casas).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + intFmt + (dec ? ',' + dec : '');
}

// R$ 48.000 (inteiro) ou R$ 93,75 (com centavos)
function formatarReais(n) {
  const v = round2(n);
  return 'R$ ' + formatarNumero(v, Number.isInteger(v) ? 0 : 2);
}

function formatarDecimal(n) {
  const v = round1(n);
  return formatarNumero(v, Number.isInteger(v) ? 0 : 1);
}

function textoResultado(resultado) {
  if (Math.abs(resultado) < 0.005) return 'empata, sem sobra nem falta';
  return resultado > 0 ? 'sobram ' + formatarReais(resultado) : 'faltam ' + formatarReais(-resultado);
}

function montarRespostaSafra(calc) {
  const { cenarios: c, entrada } = calc;
  return [
    'Pela sua conta:',
    '• Para empatar, você precisa colher pelo menos ' + formatarDecimal(calc.produtividade_minima) + ' sacas/ha.',
    '• Seu custo por saca é ' + formatarReais(calc.preco_equilibrio) + '. Vendendo abaixo disso, dá prejuízo.',
    '',
    'Cenários (preço ' + formatarReais(entrada.preco) + '):',
    '• Colhendo ' + Math.abs(c.desfavoravel.pct) + '% menos: ' + textoResultado(c.desfavoravel.resultado),
    '• Como espera: ' + textoResultado(c.esperado.resultado),
    '• Colhendo ' + c.favoravel.pct + '% mais: ' + textoResultado(c.favoravel.resultado),
    '',
    'É uma simulação com os números que você passou, não uma previsão.',
  ].join('\n');
}

function montarRespostaESe(r) {
  const direta = r.resultado < 0 ? 'Sim, faltariam ' + formatarReais(-r.resultado) : 'Não, ainda sobram ' + formatarReais(r.resultado);
  const direta0 = Math.abs(r.resultado) < 0.005 ? 'Fica no zero a zero' : direta;
  return (
    direta0 + '. Com ' + formatarDecimal(r.producao_sacas) + ' sacas a ' + formatarReais(r.preco) +
    ', a receita fica em ' + formatarReais(r.receita) + ' para um custo de ' + formatarReais(r.dados.custo_total) +
    '. Preço de equilíbrio: ' + formatarReais(r.custo_saca) + '/saca.'
  );
}

// ---------- Perfil tributário provável (regra fixa, não é LLM) ----------

function perfilProvavel(p, limite = 3600000) {
  const alertas = [];
  let perfil;
  let texto;
  if (p.receita != null && p.receita >= limite) {
    perfil = 'contribuinte';
    texto = 'Pela receita informada, você estaria acima do limite de ' + formatarReais(limite) + ' e seria contribuinte do IBS/CBS.';
  } else if (p.integrado) {
    perfil = 'integrado_nao_contribuinte';
    texto = 'Produtor integrado tem tratamento próprio: não contribuinte, salvo se optar pelo regime regular.';
  } else {
    perfil = 'nao_contribuinte';
    texto = 'Pela receita informada, seu perfil provável é não contribuinte, com a possibilidade de optar pelo regime regular.';
  }
  if (p.receita != null && p.receita >= 0.8 * limite && p.receita < limite) {
    alertas.push('Atenção: sua receita está perto do limite de ' + formatarReais(limite) + '.');
  }
  if (p.outra_empresa) {
    alertas.push('Como você tem outra empresa no agro, as receitas podem ser somadas para o limite: revise com seu contador.');
  }
  return { perfil, texto, alertas };
}

// ---------- Resposta falada (áudio da IAra) ----------
// Versão curta para virar áudio: 2 a 3 frases, sem listas. O texto completo vai junto por escrito.
function montarResumoFalado(calc) {
  const d = calc.cenarios.desfavoravel;
  return (
    'Fiz a sua conta. Para empatar, você precisa colher pelo menos ' + formatarDecimal(calc.produtividade_minima) +
    ' sacas por hectare, e seu custo por saca fica em ' + formatarReais(calc.preco_equilibrio) + '. ' +
    'Se colher ' + Math.abs(d.pct) + ' por cento menos, ' + textoResultado(d.resultado) + '. ' +
    'Mandei os detalhes por escrito aqui embaixo.'
  );
}

// ---------- Gatilho de preço ----------
// O produtor define o preço-alvo. A IAra só avisa quando a cotação chega lá: não recomenda vender.

function validarPrecoAlvo(preco_alvo) {
  const [min, max] = FAIXAS.preco;
  return typeof preco_alvo === 'number' && Number.isFinite(preco_alvo) && preco_alvo >= min && preco_alvo <= max;
}

// cotacao: { cultura, preco, praca, data }; gatilhos: [{ id, numero, cultura, preco_alvo, ativo }]
// Devolve os gatilhos que disparam com esta cotação (mesma cultura, ativos, preço >= alvo).
function avaliarGatilhos(cotacao, gatilhos) {
  if (!cotacao || typeof cotacao.preco !== 'number') return [];
  const cultura = String(cotacao.cultura || '').toLowerCase();
  return (gatilhos || []).filter(
    (g) => g.ativo && String(g.cultura || '').toLowerCase() === cultura && cotacao.preco >= g.preco_alvo
  );
}

// alerta: { cultura, praca, preco_atual, preco_alvo, custo_saca (opcional) }
function montarAlertaPreco(a) {
  const partes = [
    'IAra aqui! A saca de ' + (a.cultura || 'grão') + (a.praca ? ' na ' + a.praca : '') +
      ' chegou a ' + formatarReais(a.preco_atual) + ' hoje. Você pediu aviso a partir de ' + formatarReais(a.preco_alvo) + '.',
  ];
  if (a.custo_saca != null) {
    const sobra = round2(a.preco_atual - a.custo_saca);
    partes.push(
      sobra >= 0
        ? 'Pela sua conta, seu custo é ' + formatarReais(a.custo_saca) + ' por saca: cada saca vendida a esse preço deixa cerca de ' + formatarReais(sobra) + '.'
        : 'Atenção: pela sua conta, seu custo é ' + formatarReais(a.custo_saca) + ' por saca, acima desse preço.'
    );
  }
  partes.push('A decisão de vender é sua. Quer que eu avise o comercial da cooperativa para falar com você? Responda "sim" ou "não".');
  return partes.join(' ');
}

const API = {
  HA_POR_ALQUEIRE_PAULISTA, CENARIOS_PADRAO, FAIXAS,
  round2, converterAreaParaHa, converterProdutividadeParaScHa, mesclarExtracao,
  camposFaltantes, camposForaDaFaixa, calcularSafra, calcularESe,
  formatarReais, formatarDecimal, textoResultado, montarRespostaSafra, montarRespostaESe,
  perfilProvavel, montarResumoFalado, validarPrecoAlvo, avaliarGatilhos, montarAlertaPreco,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;

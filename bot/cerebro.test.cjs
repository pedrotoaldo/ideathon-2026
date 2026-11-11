const test = require('node:test');
const assert = require('node:assert/strict');
const { tratar } = require('./cerebro');
const { rotear, ehConfirmacao, ehNegacao } = require('./roteador');
const { sanitizarExtracao, carregarPrompt } = require('./extracao');
const { parseJsonResposta } = require('./llm');

const VAZIA = {
  cultura: null, area_valor: null, area_unidade: null, custo_total: null, produtividade_valor: null,
  produtividade_unidade: null, preco: null, gatilho_preco: null, confirmacao: false, fora_do_tema: false, alteracao: null,
};
// LLM falso: devolve a extração combinada para cada chamada
function llm(...exts) {
  let i = 0;
  const chamadas = [];
  const fn = async (texto, ctx) => { chamadas.push({ texto, ctx }); return { ext: { ...VAZIA, ...exts[i++] }, versao: 'extracao_vteste' }; };
  fn.chamadas = chamadas;
  return fn;
}
async function passo(conv, texto, extrair) {
  const r = await tratar(conv, texto, { extrair });
  return { r, conv: { estado: r.estado, dados: r.dados }, texto: r.respostas.map((x) => x.texto).join('\n---\n') };
}

test('Roteiro A: números exatos da SPEC seção 6', async () => {
  let conv = { estado: 'menu', dados: {} };
  let p = await passo(conv, '1', llm());
  assert.match(p.texto, /Vamos fazer a conta/);
  assert.equal(p.r.estado, 'coletando_safra');

  p = await passo(p.conv, '10 hectares de soja, gastei 45 mil, espero 60 sacas por hectare, saca a 100',
    llm({ cultura: 'soja', area_valor: 10, area_unidade: 'ha', custo_total: 45000, produtividade_valor: 60, produtividade_unidade: 'sc/ha', preco: 100 }));
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Entendi: 10 ha de soja, custo de R\$ 45\.000, 60 sacas\/ha e saca a R\$ 100\./);

  p = await passo(p.conv, 'sim', llm());
  assert.equal(p.r.estado, 'resultado_safra');
  assert.match(p.texto, /pelo menos 45 sacas\/ha/);
  assert.match(p.texto, /custo por saca é R\$ 75\./);
  assert.match(p.texto, /Colhendo 20% menos: sobram R\$ 3\.000/);
  assert.match(p.texto, /Como espera: sobram R\$ 15\.000/);
  assert.match(p.texto, /Colhendo 10% mais: sobram R\$ 21\.000/);
  assert.equal(p.conv.dados.ultimo_calculo.preco_equilibrio, 75);
  assert.equal(p.r.respostas.length, 2); // RESULTADO_SAFRA + OFERTA_PROXIMO

  p = await passo(p.conv, 'e se eu colher 20% menos, fico no prejuízo?', llm({ alteracao: { produtividade_pct: -20, preco: null, custo_total: null, produtividade_valor: null } }));
  assert.match(p.texto, /^Não, ainda sobram R\$ 3\.000/);
  assert.match(p.texto, /480 sacas/);
  assert.match(p.texto, /receita fica em R\$ 48\.000/);
  assert.match(p.texto, /R\$ 93,75\/saca/);

  p = await passo(p.conv, 'e se a saca for 70?', llm({ alteracao: { produtividade_pct: null, preco: 70, custo_total: null, produtividade_valor: null } }));
  assert.match(p.texto, /^Sim, faltariam R\$ 3\.000/);
  assert.match(p.texto, /600 sacas a R\$ 70/);
  assert.equal(p.r.estado, 'resultado_safra');
});

test('alqueire é convertido para hectare (Roteiro B por texto)', async () => {
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } },
    'plantei vinte alqueires de soja, vou gastar uns cento e oitenta mil, espero sessenta sacas por hectare e a saca tá cento e dez',
    llm({ cultura: 'soja', area_valor: 20, area_unidade: 'alqueire', custo_total: 180000, produtividade_valor: 60, produtividade_unidade: 'sc/ha', preco: 110 }));
  assert.match(p.texto, /48,4 ha \(20 alqueires\) de soja, custo de R\$ 180\.000, 60 sacas\/ha e saca a R\$ 110/);
  p = await passo(p.conv, 'sim', llm());
  assert.match(p.texto, /pelo menos 33,8 sacas\/ha/);
  assert.match(p.texto, /custo por saca é R\$ 61,98/);
  assert.match(p.texto, /Como espera: sobram R\$ 139\.440/);
});

test('pergunta um campo por vez, na ordem', async () => {
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } }, 'tenho 10 hectares de soja', llm({ cultura: 'soja', area_valor: 10, area_unidade: 'ha' }));
  assert.match(p.texto, /Quanto vai gastar no total/);
  p = await passo(p.conv, '45 mil', llm({ custo_total: 45000 }));
  assert.match(p.texto, /Quantas sacas por hectare/);
  p = await passo(p.conv, '60', llm({ produtividade_valor: 60 }));
  assert.match(p.texto, /Qual preço da saca/);
  p = await passo(p.conv, '100', llm({ preco: 100 }));
  assert.equal(p.r.estado, 'confirmando_safra');
});

test('área sem unidade: pergunta hectare ou alqueire, sem chamar o LLM de novo', async () => {
  const extrair = llm({ area_valor: 20, area_unidade: null });
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } }, '20', extrair);
  assert.match(p.texto, /20 são hectares ou alqueires/);
  p = await passo(p.conv, 'alqueires', extrair);
  assert.equal(extrair.chamadas.length, 1);
  assert.equal(p.conv.dados.safra.area_ha, 48.4);
});

test('valor fora da faixa não é calculado: pergunta de novo', async () => {
  const p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } }, 'preço 5000', llm({ preco: 5000 }));
  assert.match(p.texto, /fora do comum/);
  assert.match(p.texto, /Qual o tamanho da área|Qual preço/);
  assert.equal(p.conv.dados.safra.preco, null);
});

test('correção na confirmação volta a confirmar', async () => {
  const base = { estado: 'confirmando_safra', dados: { safra: { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 } } };
  let p = await passo(base, 'não', llm());
  assert.match(p.texto, /Qual número está errado/);
  p = await passo(base, 'a saca é 110', llm({ preco: 110 }));
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /saca a R\$ 110/);
});

test('"e se" sem conta pronta pede a conta; fora do escopo vai por LLM', async () => {
  let p = await passo({ estado: 'menu', dados: {} }, 'e se a saca for 90?', llm());
  assert.match(p.texto, /preciso da conta da safra/);
  p = await passo({ estado: 'menu', dados: {} }, 'quem ganhou o jogo ontem?', llm({ fora_do_tema: true }));
  assert.match(p.texto, /Eu só ajudo com a conta da safra/);
  assert.equal(p.r.respostas[0].intencao, 'fora_escopo');
});

test('menu sai do fluxo; "3" e "2" ainda não implementados respondem EM_BREVE sem LLM', async () => {
  const extrair = llm();
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {} } }, 'menu', extrair);
  assert.equal(p.r.estado, 'menu');
  p = await passo({ estado: 'menu', dados: {} }, '2', extrair);
  assert.match(p.texto, /ainda não está pronta/);
  assert.equal(extrair.chamadas.length, 0);
});

test('roteador: palavras-chave e fluxo ativo', () => {
  assert.equal(rotear('Oi!', 'menu').intencao, 'menu');
  assert.equal(rotear('1', 'menu').intencao, 'safra');
  assert.equal(rotear('quero calcular o custo', 'menu').intencao, 'safra');
  assert.equal(rotear('2', 'menu').intencao, 'tributario');
  assert.equal(rotear('me avisa quando a soja passar de 95', 'menu').intencao, 'gatilho');
  assert.equal(rotear('quem ganhou o jogo?', 'menu').intencao, 'ambiguo');
  assert.equal(rotear('1', 'coletando_safra').intencao, 'fluxo');
  assert.equal(rotear('menu', 'coletando_safra').intencao, 'menu');
  assert.equal(rotear('3', 'coletando_safra').intencao, 'humano');
});

test('confirmação e negação', () => {
  for (const t of ['sim', 'Sim!', 'isso mesmo', 'sim, isso mesmo', 'ok', 'certo']) assert.equal(ehConfirmacao(t), true, t);
  for (const t of ['não', 'sim, mas a saca é 110', 'a saca é 100']) assert.equal(ehConfirmacao(t), false, t);
  assert.equal(ehNegacao('Não'), true);
});

test('extração: sanitização e prompt carregado do arquivo', () => {
  const e = sanitizarExtracao({ cultura: ' soja ', area_valor: '10', area_unidade: 'hectare', custo_total: 'abc', preco: 100, alteracao: { preco: null } });
  assert.equal(e.area_valor, 10);
  assert.equal(e.area_unidade, null);
  assert.equal(e.custo_total, null);
  assert.equal(e.cultura, 'soja');
  assert.equal(e.alteracao, null);
  const p = carregarPrompt();
  assert.match(p.system, /Você extrai dados de uma safra/);
  assert.match(p.system, /"fora_do_tema"/);
  assert.match(p.versao, /^extracao_v\d/);
});

test('parse do JSON do LLM tolera cercas e rejeita lixo', () => {
  assert.deepEqual(parseJsonResposta('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJsonResposta('não é json'), null);
  assert.equal(parseJsonResposta('[1]'), null);
});

test('LLM que repete a área já coletada não apaga o "alqueires" da confirmação', async () => {
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } }, '20', llm({ area_valor: 20, area_unidade: null }));
  p = await passo(p.conv, 'alqueires', llm());
  p = await passo(p.conv, 'uns 90 mil', llm({ custo_total: 90000, area_valor: 48.4, area_unidade: 'ha' }));
  assert.equal(p.conv.dados.safra.area_origem.valor, 20);
});

test('"e se" durante a confirmação: pede o sim e continua em confirmando_safra', async () => {
  const base = { estado: 'confirmando_safra', dados: { safra: { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 } } };
  const extrair = llm();
  const p = await passo(base, 'e se a saca for 90?', extrair);
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Primeiro me confirme os dados com 'sim' e logo depois eu simulo esse cenário\./);
  assert.equal(extrair.chamadas.length, 0);
});

test('"apagar meus dados": pede a ação de apagar e confirma, em qualquer estado', async () => {
  for (const estado of ['menu', 'coletando_safra', 'resultado_safra']) {
    const p = await passo({ estado, dados: { safra: {} } }, 'apagar meus dados', llm());
    assert.equal(p.r.acao, 'apagar');
    assert.match(p.texto, /apaguei os dados desta conversa/);
  }
});

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
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: { campo_pedido: 'area_ha' } } }, '20', extrair);
  assert.match(p.texto, /20 são hectares ou alqueires/);
  p = await passo(p.conv, 'alqueires', extrair);
  assert.equal(extrair.chamadas.length, 0); // número solto + unidade: resolvido sem LLM
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

test('menu sai do fluxo; "meus alertas" (Plus 2) responde EM_BREVE sem LLM', async () => {
  const extrair = llm();
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {} } }, 'menu', extrair);
  assert.equal(p.r.estado, 'menu');
  p = await passo({ estado: 'menu', dados: {} }, 'meus alertas', extrair);
  assert.match(p.texto, /ainda não está pronta/);
  assert.equal(extrair.chamadas.length, 0);
});

test('alerta: "me avisa quando a soja passar de 95" cria o alerta sem LLM e cita o custo da conta', async () => {
  const extrair = llm();
  const dados = { ultimo_calculo: { cultura: 'soja', preco_equilibrio: 75 } };
  const p = await passo({ estado: 'resultado_safra', dados }, 'me avisa quando a soja passar de 95', extrair);
  assert.match(p.texto, /Quando a saca de soja chegar a R\$ 95 ou mais, eu te aviso aqui\. Pela sua conta, seu custo é R\$ 75 por saca\./);
  assert.equal(p.r.estado, 'menu');
  assert.deepEqual({ ...p.r.dados.alerta, criado_em: undefined }, { cultura: 'soja', cultura_nome: 'soja', preco_alvo: 95, ativo: true, criado_em: undefined });
  assert.equal(extrair.chamadas.length, 0);
});

test('alerta: sem conta da mesma cultura não cita custo; "4" pede cultura e preço e o próximo texto completa', async () => {
  const extrair = llm();
  let p = await passo({ estado: 'menu', dados: { ultimo_calculo: { cultura: 'milho', preco_equilibrio: 40 } } }, '4', extrair);
  assert.match(p.texto, /me diga a cultura e o preço da saca/);
  assert.equal(p.r.estado, 'criando_alerta');
  p = await passo(p.conv, 'soja 95', extrair);
  assert.match(p.texto, /chegar a R\$ 95 ou mais/);
  assert.doesNotMatch(p.texto, /seu custo/);
  assert.equal(p.r.dados.alerta.ativo, true);
  assert.equal(extrair.chamadas.length, 0);
});

test('alerta: preço fora da faixa é recusado; sem cultura conhecida usa o LLM', async () => {
  let p = await passo({ estado: 'menu', dados: {} }, 'me avisa quando a soja passar de 5', llm());
  assert.match(p.texto, /fora do comum/);
  assert.equal(p.r.dados.alerta, undefined);
  const extrair = llm({ cultura: 'milheto', gatilho_preco: 80 });
  p = await passo({ estado: 'menu', dados: {} }, 'me avisa quando a saca de milheto passar de 80', extrair);
  assert.equal(p.r.dados.alerta.cultura, 'milheto');
  assert.equal(extrair.chamadas.length, 1);
});

test('alerta: depois do aviso, "sim" encaminha e "não" encerra; outra frase segue como no menu', async () => {
  const base = { estado: 'aguardando_resposta_alerta', dados: { alerta: { cultura: 'soja', preco_alvo: 95, ativo: false, disparado: { preco: 98 } } } };
  let p = await passo(base, 'sim', llm());
  assert.match(p.texto, /Certo, registrei/);
  assert.equal(p.r.acao, 'encaminhar');
  assert.equal(p.r.contexto.origem, 'alerta');
  assert.equal(p.r.contexto.preco_cotacao, 98);
  assert.equal(p.r.estado, 'menu');
  p = await passo(base, 'não', llm());
  assert.match(p.texto, /Tudo bem\. Se quiser outro alerta/);
  assert.equal(p.r.acao, undefined);
  p = await passo(base, 'menu', llm());
  assert.match(p.texto, /Como posso ajudar/);
  assert.equal(p.r.estado, 'menu');
});

test('roteador: palavras-chave e fluxo ativo', () => {
  assert.equal(rotear('Oi!', 'menu').intencao, 'menu');
  assert.equal(rotear('1', 'menu').intencao, 'safra');
  assert.equal(rotear('quero calcular o custo', 'menu').intencao, 'safra');
  assert.equal(rotear('2', 'menu').intencao, 'perfil');
  assert.equal(rotear('me conta uma piada', 'menu').intencao, 'ambiguo');
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
  let p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: { campo_pedido: 'area_ha' } } }, '20', llm({ area_valor: 20, area_unidade: null }));
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

// ---- Regressão: conversa real do celular (números soltos viravam produtividade e preço) ----
test('REGRESSÃO celular: "2" solto não vira produtividade; "60 cerca de 100" pede a interpretação', async () => {
  // LLM falso se comporta mal de propósito: pega só o primeiro número ("60" → preço), como no bug
  const extrair = llm(
    { cultura: 'soja', area_valor: 10, area_unidade: null },   // "10 de soja"
    { preco: 60 },                                             // "60 cerca de 100"
  );
  let p = await passo({ estado: 'menu', dados: {} }, '1', extrair);
  assert.match(p.texto, /Vamos fazer a conta/);

  p = await passo(p.conv, '2', extrair); // logo depois do PEDE_SAFRA: nenhum campo foi perguntado
  assert.match(p.texto, /Esse número é o quê\?/);
  assert.equal(p.conv.dados.safra.produtividade, undefined);
  assert.equal(p.r.estado, 'coletando_safra');

  p = await passo(p.conv, '10 de soja', extrair);
  assert.match(p.texto, /Esses 10 são hectares ou alqueires\?/);
  p = await passo(p.conv, 'hectares', extrair);
  assert.match(p.texto, /Quanto vai gastar no total/);
  p = await passo(p.conv, '40 mil', extrair);
  assert.equal(p.conv.dados.safra.custo_total, 40000);
  assert.match(p.texto, /Quantas sacas por hectare/); // não pula a produtividade

  p = await passo(p.conv, '60 cerca de 100', extrair);
  assert.match(p.texto, /^60 são as sacas por hectare e 100 o preço da saca\?/);
  assert.equal(p.conv.dados.safra.preco, undefined); // não foi guardado como preço R$ 60
  assert.equal(p.conv.dados.safra.produtividade, undefined);

  p = await passo(p.conv, 'sim', extrair);
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Entendi: 10 ha de soja, custo de R\$ 40\.000, 60 sacas\/ha e saca a R\$ 100\./);
  assert.doesNotMatch(p.texto, /Atenção/);

  p = await passo(p.conv, 'sim', extrair);
  assert.match(p.texto, /custo por saca é R\$ 66,67/);
  assert.doesNotMatch(p.texto, /fora do comum/);
});

test('REGRESSÃO celular: 2 sc/ha para soja destaca o aviso e exige "sim, está certo"; resultado extremo ganha alerta', async () => {
  const base = { estado: 'coletando_safra', dados: { safra: { cultura: 'soja', area_ha: 10, custo_total: 40000 }, coleta: { campo_pedido: 'produtividade' } } };
  const extrair = llm();
  let p = await passo(base, '2', extrair); // número solto + pergunta de produtividade → vai para a produtividade
  assert.equal(p.conv.dados.safra.produtividade, 2);
  assert.match(p.texto, /Qual preço da saca/);
  p = await passo(p.conv, '60', extrair);
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Atenção: 2 sacas por hectare é bem abaixo do comum para soja\. Atenção: o custo por saca \(R\$ 2\.000\) ficou mais que o dobro.* Está certo\?/);
  p = await passo(p.conv, 'sim', extrair); // "sim" simples não basta
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Atenção: 2 sacas por hectare/);
  p = await passo(p.conv, 'sim, está certo', extrair);
  assert.equal(p.r.estado, 'resultado_safra');
  assert.match(p.texto, /custo por saca é R\$ 2\.000/);
  assert.match(p.texto, /Esse resultado ficou bem fora do comum\. Vale conferir os números\./);
});

test('aviso de faixa: corrigir o número em vez de confirmar', async () => {
  const base = { estado: 'confirmando_safra', dados: { safra: { cultura: 'soja', area_ha: 10, custo_total: 40000, produtividade: 2, preco: 60 }, coleta: { alerta_faixa: 'Atenção: 2 sacas por hectare é bem abaixo do comum para soja. Está certo?' } } };
  const p = await passo(base, 'são 60 sacas por hectare', llm({ produtividade_valor: 60, produtividade_unidade: 'sc/ha' }));
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.doesNotMatch(p.texto, /Atenção/);
  assert.match(p.texto, /60 sacas\/ha/);
});

test('"1" seguido de "2" na mesma janela (debounce): pede a conta e o "2" cai na regra do número solto', async () => {
  const extrair = llm();
  const p = await passo({ estado: 'menu', dados: {} }, '1\n2', extrair);
  assert.match(p.texto, /Vamos fazer a conta/);
  assert.match(p.texto, /Esse número é o quê\?/);
  assert.equal(p.r.estado, 'coletando_safra');
  assert.equal(p.conv.dados.safra.produtividade, undefined);
  assert.equal(extrair.chamadas.length, 0);
});

test('vários números com rótulo claro são todos aceitos; sem campo pendente e ambíguo pede para reformular', async () => {
  const base = { estado: 'coletando_safra', dados: { safra: { cultura: 'soja', area_ha: 10, custo_total: 40000 }, coleta: { campo_pedido: 'produtividade' } } };
  let p = await passo(base, '60 sacas por hectare e saca a 100', llm({ produtividade_valor: 60, produtividade_unidade: 'sc/ha', preco: 100 }));
  assert.equal(p.r.estado, 'confirmando_safra');
  p = await passo({ estado: 'coletando_safra', dados: { safra: {}, coleta: {} } }, '10 40 60 100', llm({ area_valor: 10, area_unidade: 'ha', numeros_ambiguos: true }));
  assert.match(p.texto, /Vi vários números e não sei a que cada um se refere/);
  assert.equal(p.conv.dados.safra.area_ha, undefined);
});

test('número solto: parser', () => {
  const { numeroSolto, contarNumeros } = require('./roteador');
  assert.equal(numeroSolto('2'), 2);
  assert.equal(numeroSolto('40 mil'), 40000);
  assert.equal(numeroSolto('uns 90 mil'), 90000);
  assert.equal(numeroSolto('R$ 100'), 100);
  assert.equal(numeroSolto('45.000'), 45000);
  assert.equal(numeroSolto('1,2 milhão'), 1200000);
  assert.equal(numeroSolto('60 sacas'), null);
  assert.equal(numeroSolto('10 hectares'), null);
  assert.equal(numeroSolto('60 cerca de 100'), null);
  assert.deepEqual(contarNumeros('60 cerca de 100'), [60, 100]);
  assert.deepEqual(contarNumeros('saca de 60 kg a 100 reais, gastei 45 mil'), [100, 45000]);
});

// ---------- Conversa real de 11/11 (teste pelo celular com áudio) ----------
const CONF = { cultura: 'soja', area_ha: 10, custo_total: 45000, produtividade: 60, preco: 100 };

test('REGRESSÃO 11/11 (1): saudação no meio do fluxo pergunta se continua; "continuar" repete a pergunta, "menu" sai', async () => {
  const extrair = llm();
  const base = { estado: 'coletando_safra', dados: { safra: {}, coleta: { pendente_area: 2 } } };
  let p = await passo(base, 'Opa! E aí?', extrair);
  assert.match(p.texto, /Quer continuar a conta ou ver o menu\?/);
  assert.equal(p.r.estado, 'coletando_safra');
  assert.equal(p.r.dados.coleta.pendente_area, 2); // nada foi tomado como resposta
  assert.equal(extrair.chamadas.length, 0);
  p = await passo(p.conv, 'continuar', extrair);
  assert.match(p.texto, /Esses 2 são hectares ou alqueires\?/);
  p = await passo(p.conv, 'oi', extrair);
  p = await passo(p.conv, 'menu', extrair);
  assert.equal(p.r.estado, 'menu');
  assert.match((await passo({ estado: 'menu', dados: {} }, 'opa e aí', extrair)).texto, /Como posso ajudar/); // fora do fluxo: menu
});

test('REGRESSÃO 11/11 (2): "40 hectares" dito com a pendência "2 → hectares ou alqueires?" substitui o 2 e o resto da mensagem segue', async () => {
  const base = { estado: 'coletando_safra', dados: { safra: { cultura: 'soja' }, coleta: { pendente_area: 2 } } };
  const extrair = llm({ area_valor: 40, area_unidade: 'ha', custo_total: 40000 });
  const p = await passo(base, 'São hectares. É... 40 hectares. É investir 40 mil.', extrair);
  assert.equal(p.r.dados.safra.area_ha, 40);
  assert.equal(p.r.dados.safra.custo_total, 40000);
  assert.equal(p.r.dados.coleta.pendente_area, undefined);
  assert.match(p.texto, /Quantas sacas por hectare/);
  // só a unidade ("hectares") continua usando o número pendente
  const q = await passo(base, 'São hectares.', llm());
  assert.equal(q.r.dados.safra.area_ha, 2);
});

test('REGRESSÃO 11/11 (3): sem cultura pergunta a cultura antes de confirmar; números estranhos exigem "sim, está certo"', async () => {
  const sem = { estado: 'coletando_safra', dados: { safra: { area_ha: 10, custo_total: 45000, produtividade: 60 }, coleta: { campo_pedido: 'preco' } } };
  let p = await passo(sem, '20', llm());
  assert.match(p.texto, /Qual é a cultura\?/);
  assert.equal(p.r.estado, 'coletando_safra');
  p = await passo(p.conv, 'soja', llm());
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Atenção: saca a R\$ 20 é bem abaixo do comum \(menos de R\$ 30\)\./);
  assert.match(p.texto, /custo por saca \(R\$ 75\) ficou mais que o dobro do preço da saca \(R\$ 20\)/);
  p = await passo(p.conv, 'Isso.', llm()); // "isso" não basta nesses casos
  assert.equal(p.r.estado, 'confirmando_safra');
  assert.match(p.texto, /Atenção: saca a R\$ 20/);
  p = await passo(p.conv, 'Sim, está certo.', llm());
  assert.equal(p.r.estado, 'resultado_safra');
});

test('REGRESSÃO 11/11 (3): custo por hectare fora de R$ 1.000 a R$ 15.000 é destacado; limites vêm da config', async () => {
  const base = { estado: 'coletando_safra', dados: { safra: { cultura: 'soja', area_ha: 2, produtividade: 60, preco: 100 }, coleta: { campo_pedido: 'custo_total' } } };
  const p = await passo(base, '40 mil', llm());
  assert.match(p.texto, /custo de R\$ 20\.000 por hectare está fora do comum/);
  const q = await tratar(base, '40 mil', { extrair: llm(), limitesSanidade: { custo_ha_max: 25000 } });
  assert.doesNotMatch(q.respostas.map((x) => x.texto).join(' '), /por hectare está fora do comum/);
});

test('REGRESSÃO 11/11 (4): variações de "sim" por texto ou transcrição de áudio confirmam', async () => {
  for (const t of ['Isso.', 'Sim.', 'Tá certo.', 'Pode ser.', 'SIM!', 'siiim', 'Isso mesmo', 'É isso', 'Sim, sim.', 'Tá certo, pode fazer a conta', 'Aham', 'Beleza.']) {
    assert.equal(ehConfirmacao(t), true, t);
    const p = await passo({ estado: 'confirmando_safra', dados: { safra: { ...CONF }, coleta: {} } }, t, llm());
    assert.equal(p.r.estado, 'resultado_safra', t);
  }
  for (const t of ['Não.', 'Isso não', 'está errado', 'quarenta mil']) assert.equal(ehConfirmacao(t), false, t);
});

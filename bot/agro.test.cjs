const test = require('node:test');
const assert = require('node:assert/strict');
const { responder, interpretar, pedeProduto, temDoseOuProduto, carregarPrompt } = require('./agro');
const { tratar } = require('./cerebro');
const { rotear } = require('./roteador');
const T = require('./textos');

const VAZIA = {
  cultura: null, area_valor: null, area_unidade: null, custo_total: null, produtividade_valor: null,
  produtividade_unidade: null, preco: null, gatilho_preco: null, confirmacao: false, fora_do_tema: false, alteracao: null,
};
const extrairFalso = async () => ({ ext: { ...VAZIA, fora_do_tema: true }, versao: 'extracao_vteste' });

// agro falso: devolve o texto combinado e conta as chamadas do LLM
function agroCom(saida) {
  const chamadas = [];
  const fn = (pergunta) => responder(pergunta, async (o) => { chamadas.push(o); return saida; });
  fn.chamadas = chamadas;
  return fn;
}
async function passo(conv, texto, agro) {
  const r = await tratar(conv, texto, { extrair: extrairFalso, agro });
  return { r, conv: { estado: r.estado, dados: r.dados }, texto: r.respostas.map((x) => x.texto).join('\n---\n') };
}
const MENU = () => ({ estado: 'menu', dados: {} });

test('prompt agro_geral carrega do arquivo e traz as regras', () => {
  const p = carregarPrompt();
  assert.match(p.versao, /^agro_geral_v\d/);
  assert.match(p.system, /120 palavras/);
  assert.match(p.system, /Pode ser X ou Y; só confirmando no campo/);
  assert.match(p.system, /SEM_RECEITA/);
  assert.match(p.system, /FORA_ESCOPO/);
  assert.match(p.system, /Embrapa/);
  assert.match(p.system, /IDR-Paraná/);
});

test('roteador: dúvidas do agro viram agro_geral; número na frase continua sendo dado da safra', () => {
  for (const t of ['como tratar ferrugem na soja?', 'qual veneno passo na lagarta e quanto?', 'minha soja está amarelando', 'quando plantar milho safrinha?', 'como prevenir mofo no feijão', 'qual a época de plantio do trigo?']) {
    assert.equal(rotear(t, 'menu').intencao, 'agro_geral', t);
  }
  assert.equal(rotear('10 hectares de soja, gastei 45 mil em adubo, espero 60 sacas', 'menu').intencao, 'safra');
  assert.equal(rotear('quero calcular o custo da safra', 'menu').intencao, 'safra');
  assert.equal(rotear('quem vai ganhar a eleição?', 'menu').intencao, 'ambiguo');
  assert.equal(rotear('vai chover amanhã?', 'menu').intencao, 'clima');
  assert.equal(rotear('qual o preço da soja?', 'menu').intencao, 'cotacao_demo');
});

test('pedido de produto ou dose não chega ao LLM e vai direto ao texto do receituário', async () => {
  const agro = agroCom('NÃO DEVIA CHAMAR');
  const p = await passo(MENU(), 'qual veneno passo na lagarta e quanto?', agro);
  assert.equal(p.texto, T.AGRO_SEM_RECEITA);
  assert.match(p.texto, /^Recomendação de produto e dose precisa de receituário agronômico\. Quer que eu chame um agrônomo da cooperativa\?/);
  assert.equal(agro.chamadas.length, 0);
  assert.equal(p.r.estado, 'agro_geral');
  assert.equal(p.r.respostas[0].usou_llm, false);
  for (const t of ['qual produto uso na ferrugem?', 'quanto de veneno por hectare', 'qual a dose do fungicida', 'o que passo na lagarta']) assert.equal(pedeProduto(t), true, t);
  for (const t of ['como tratar ferrugem na soja?', 'minha soja está amarelando', 'quando plantar milho safrinha?']) assert.equal(pedeProduto(t), false, t);
});

test('"como tratar ferrugem na soja?": explica e termina com o fechamento do agrônomo', async () => {
  const agro = agroCom('A ferrugem é uma doença causada por fungo. Gosta de folha molhada e calor. Monitore a lavoura, use variedade resistente e respeite a época de plantio. Embrapa e IDR-Paraná têm material sobre isso.');
  const p = await passo(MENU(), 'como tratar ferrugem na soja?', agro);
  assert.match(p.texto, /^A ferrugem é uma doença/);
  assert.ok(p.texto.endsWith('Para o seu caso, vale confirmar com o agrônomo. Quer que eu chame um?'));
  assert.equal(p.r.estado, 'agro_geral');
  assert.equal(p.r.respostas[0].intencao, 'agro_geral');
  assert.equal(agro.chamadas.length, 1);
  assert.match(agro.chamadas[0].system, /Você é a IAra/);
  assert.equal(p.r.dados.nao_sei.pergunta, 'como tratar ferrugem na soja?');
});

test('"minha soja está amarelando" e "quando plantar milho safrinha?" passam pelo LLM e levam o fechamento', async () => {
  let p = await passo(MENU(), 'minha soja está amarelando', agroCom('Pode ser falta de nutriente ou doença de raiz; só confirmando no campo.'));
  assert.match(p.texto, /Pode ser falta de nutriente ou doença de raiz; só confirmando no campo\./);
  assert.match(p.texto, /Quer que eu chame um\?$/);
  p = await passo(MENU(), 'quando plantar milho safrinha?', agroCom('Depende da região. Veja o Zoneamento Agrícola de Risco Climático e fale com a assistência técnica.'));
  assert.match(p.texto, /Zoneamento Agrícola/);
  assert.match(p.texto, /Quer que eu chame um\?$/);
});

test('conferência da saída: dose, unidade de aplicação, calda, "aplique" e nome comercial são descartados', () => {
  for (const s of [
    'Aplique 300 mL/ha de fungicida.', 'Use 1,5 L/ha.', 'Passe 200 g/ha na lavoura.', 'Faça a calda com 100 litros.', 'Aplique o produto no início.',
    'Use tebuconazol.', 'O Priori Xtra resolve.', 'Glifosato controla o mato.', 'Use 2 kg por hectare do fungicida.', 'Pulverize cedo de manhã.',
  ]) {
    const x = interpretar(s);
    assert.equal(x.tipo, 'sem_receita', s);
    assert.equal(x.texto, T.AGRO_SEM_RECEITA, s);
  }
  // adubo em kg/ha sem defensivo e texto normal passam
  assert.equal(interpretar('Faça análise de solo antes de adubar. Confira com a Embrapa.').tipo, 'resposta');
  assert.equal(temDoseOuProduto('Rotação de culturas ajuda a reduzir a doença.'), false);
  assert.equal(interpretar('SEM_RECEITA').tipo, 'sem_receita');
  assert.equal(interpretar('FORA_ESCOPO').texto, T.FORA_ESCOPO);
  assert.equal(interpretar('NAO_SEI').texto, T.AGRO_NAO_SEI);
  assert.equal(interpretar('').tipo, 'nao_sei');
});

test('saída com dose vinda do LLM é trocada pelo texto padrão mesmo numa pergunta comum', async () => {
  const agro = agroCom('Para a ferrugem, aplique 300 mL/ha de fungicida a cada 14 dias.');
  const p = await passo(MENU(), 'como tratar ferrugem na soja?', agro);
  assert.equal(p.texto, T.AGRO_SEM_RECEITA);
  assert.equal(agro.chamadas.length, 1);
});

test('fora do agro continua FORA_ESCOPO (política, saúde, piada)', async () => {
  const p = await passo(MENU(), 'quem vai ganhar a eleição?', agroCom('NÃO DEVIA CHAMAR'));
  assert.match(p.texto, /Eu só ajudo com a conta da safra/);
  assert.equal(p.r.respostas[0].intencao, 'fora_escopo');
  // o LLM do agro devolve FORA_ESCOPO numa pergunta com cara de agro
  const q = await passo(MENU(), 'minha soja está com dor de cabeça e febre', agroCom('FORA_ESCOPO'));
  assert.match(q.texto, /Eu só ajudo com a conta da safra/);
  assert.equal(q.r.estado, 'menu');
});

test('depois da resposta agronômica: "sim" chama o agrônomo, "3" também, "não" volta ao menu', async () => {
  const agro = agroCom('A ferrugem é uma doença causada por fungo.');
  const base = (await passo(MENU(), 'como tratar ferrugem na soja?', agro)).conv;
  let p = await passo(base, 'sim', agro);
  assert.equal(p.r.acao, 'encaminhar');
  assert.equal(p.r.motivo, 'sem_resposta_segura');
  assert.equal(p.r.contexto.pergunta, 'como tratar ferrugem na soja?');
  assert.equal(p.r.estado, 'menu');
  p = await passo(base, '3', agro);
  assert.equal(p.r.acao, 'encaminhar');
  p = await passo(base, 'não', agro);
  assert.equal(p.r.estado, 'menu');
  assert.equal(p.r.acao, undefined);
  // outra pergunta agronômica segue a conversa
  p = await passo(base, 'e a lagarta?', agroCom('A lagarta come a folha.'));
  assert.match(p.texto, /^A lagarta come a folha\./);
});

test('LLM do agro só é usado quando precisa: sem deps.agro cai no texto antigo do agrônomo', async () => {
  const r = await tratar(MENU(), 'minha soja está amarelando', { extrair: extrairFalso });
  assert.match(r.respostas[0].texto, /Diagnóstico de lavoura/);
});

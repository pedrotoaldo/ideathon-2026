const test = require('node:test');
const assert = require('node:assert/strict');
const { dolar, clima } = require('./consultas');
const demo = require('./cotacoes-demo');
const { tratar } = require('./cerebro');
const { rotear, cidadeDoTexto } = require('./roteador');
const { escolherFala, paraFala } = require('./audio');

const ok = (corpo) => async () => ({ ok: true, json: async () => corpo });
const DOLAR = { USDBRL: { bid: '5.56', ask: '5.5611', pctChange: '-0.41', timestamp: '1794429632', create_date: '2026-11-11 17:40:32' } };
const GEO = { results: [{ name: 'Mandaguari', admin1: 'Paraná', latitude: -23.52, longitude: -51.68 }] };
const PREV = { daily: { time: ['2026-11-11', '2026-11-12'], precipitation_sum: [3.6, 0], temperature_2m_max: [25.5, 27], temperature_2m_min: [16.5, 18] } };

test('dólar: compra, venda, variação do dia, horário e fonte', async () => {
  const t = await dolar({ fetchFn: ok(DOLAR) });
  assert.match(t, /compra R\$ 5,5600 e venda R\$ 5,5611\./);
  assert.match(t, /Variação do dia: -0,41%\./);
  assert.match(t, /Cotação de 11\/11 às 17:40\./);
  assert.match(t, /Fonte: AwesomeAPI\.$/);
  await assert.rejects(() => dolar({ fetchFn: ok({}) }));
  await assert.rejects(() => dolar({ fetchFn: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test('clima: geocoding BR em português + 5 dias; fonte; cidade inexistente; sem cidade', async () => {
  const urls = [];
  const fetchFn = async (url) => { urls.push(url); return { ok: true, json: async () => (url.includes('geocoding') ? GEO : PREV) }; };
  const x = await clima('Mandaguari', { fetchFn });
  assert.equal(x.tipo, 'ok');
  assert.match(urls[0], /language=pt/);
  assert.match(urls[0], /countryCode=BR/);
  assert.match(urls[1], /precipitation_sum,temperature_2m_max,temperature_2m_min/);
  assert.match(urls[1], /timezone=America%2FSao_Paulo/);
  assert.match(x.texto, /Tempo em Mandaguari, Paraná/);
  assert.match(x.texto, /qua 11\/11: 17° a 26°, chuva de 3,6 mm/);
  assert.match(x.texto, /qui 12\/11: 18° a 27°, sem chuva/);
  assert.match(x.texto, /Fonte: Open-Meteo\. É informação do tempo, não previsão de colheita\.$/);
  assert.equal((await clima('xyz', { fetchFn: ok({}) })).tipo, 'nao_encontrada');
  assert.equal((await clima('', { fetchFn })).tipo, 'sem_cidade');
});

test('cotações da demonstração: valores ilustrativos, praça, data e o aviso no fim', () => {
  const agora = new Date('2026-11-11T15:00:00Z');
  const s = demo.responder('soja', agora);
  assert.match(s, /^Soja: R\$ 138 por saca \(região de Mandaguari, 11\/11\/2026\)\./);
  assert.ok(s.endsWith('Valor ilustrativo da demonstração, não é cotação real. No produto, a cotação vem oficial da cooperativa.'));
  assert.match(demo.responder('milho', agora), /Milho: R\$ 68 por saca/);
  assert.match(demo.responder('trigo', agora), /Trigo: R\$ 82 por saca/);
  assert.match(demo.responder('boi', agora), /Boi gordo: R\$ 345 por arroba/);
  assert.equal(demo.responder(null, agora).split('Valor ilustrativo').length, 2); // aviso uma vez só
});

test('roteador: dólar, clima, preço de soja/milho/trigo/boi e opção 5; previsão de preço continua PREVISAO', () => {
  const r = (t, e = 'menu') => rotear(t, e);
  assert.equal(r('dólar').intencao, 'dolar');
  assert.equal(r('quanto está o dólar hoje?').intencao, 'dolar');
  assert.equal(r('como está o tempo em Mandaguari?').intencao, 'clima');
  assert.equal(r('vai chover em Maringá amanhã').intencao, 'clima');
  assert.equal(r('preço da soja').produto, 'soja');
  assert.equal(r('quanto está o milho').produto, 'milho');
  assert.equal(r('cotação do trigo').produto, 'trigo');
  assert.equal(r('boi gordo preço').produto, 'boi');
  assert.equal(r('5').intencao, 'precos_clima');
  for (const t of ['o dólar vai subir?', 'previsão de preço da soja', 'a soja vai cair?', 'quanto vai valer a soja mês que vem', 'vai subir o milho?']) assert.equal(r(t).intencao, 'previsao', t);
  assert.equal(r('me avisa quando a soja passar de 95').intencao, 'gatilho');
  assert.equal(r('quanto tempo leva a colheita').intencao, 'safra');
  assert.equal(r('a saca a 100, qual o preço da saca').intencao, 'safra');
  assert.equal(cidadeDoTexto('previsão do tempo em Apucarana'), 'apucarana');
  assert.equal(cidadeDoTexto('como está o tempo hoje em Santa Cruz do Rio Pardo'), 'santa cruz do rio pardo');
  assert.equal(cidadeDoTexto('vai chover?'), null);
});

const deps = (extra = {}) => ({
  extrair: async () => { throw new Error('sem LLM'); },
  precosAtivo: true,
  climaAtivo: true,
  dolar: async () => 'Dólar agora: ...\nFonte: AwesomeAPI.',
  clima: async () => ({ tipo: 'ok', texto: 'Tempo em X\nFonte: Open-Meteo.' }),
  ...extra,
});
const texto = (r) => r.respostas.map((x) => x.texto).join('\n');
const menu = () => ({ estado: 'menu', dados: {} });

test('cerebro: dólar e fallback ("Não consegui consultar agora"), sem derrubar a conversa', async () => {
  let r = await tratar(menu(), 'dólar', deps());
  assert.match(texto(r), /Fonte: AwesomeAPI/);
  r = await tratar(menu(), 'dólar', deps({ dolar: async () => { throw new Error('timeout'); } }));
  assert.equal(texto(r), 'Não consegui consultar agora, tente de novo em instantes.');
  assert.equal(r.estado, 'menu');
});

test('cerebro: clima com cidade; sem cidade pergunta e a resposta é a cidade; cidade inexistente pergunta de novo', async () => {
  let visto;
  const clima = async (c) => { visto = c; return c === 'xyz' ? { tipo: 'nao_encontrada' } : { tipo: 'ok', texto: 'Tempo em ' + c + '\nFonte: Open-Meteo.' }; };
  let r = await tratar(menu(), 'como está o tempo em Mandaguari?', deps({ clima }));
  assert.equal(visto, 'mandaguari');
  assert.match(texto(r), /Fonte: Open-Meteo/);
  r = await tratar(menu(), 'vai chover?', deps({ clima }));
  assert.match(texto(r), /De qual cidade\?/);
  assert.equal(r.estado, 'clima_cidade');
  r = await tratar({ estado: 'clima_cidade', dados: {} }, 'xyz', deps({ clima }));
  assert.match(texto(r), /Não encontrei essa cidade/);
  assert.equal(r.estado, 'clima_cidade');
  r = await tratar({ estado: 'clima_cidade', dados: {} }, 'Londrina', deps({ clima }));
  assert.equal(visto, 'Londrina');
  assert.equal(r.estado, 'menu');
  r = await tratar({ estado: 'clima_cidade', dados: {} }, 'dólar', deps({ clima })); // outra pergunta tira do estado
  assert.match(texto(r), /AwesomeAPI/);
  assert.equal(r.estado, 'menu');
  r = await tratar(menu(), 'vai chover em Maringá', deps({ clima: async () => { throw new Error('HTTP 500'); } }));
  assert.equal(texto(r), 'Não consegui consultar agora, tente de novo em instantes.');
});

test('cerebro: soja/milho/trigo/boi usam a cotação ilustrativa com o aviso; opção 5 mostra o que há; previsão continua PREVISAO', async () => {
  let r = await tratar(menu(), 'preço da soja', deps());
  assert.match(texto(r), /Soja: R\$ 138 por saca \(região de Mandaguari/);
  assert.match(texto(r), /Valor ilustrativo da demonstração, não é cotação real\. No produto, a cotação vem oficial da cooperativa\.$/);
  assert.equal(r.dados.alerta, undefined); // nada disso liga ao alerta de preço
  r = await tratar(menu(), '5', deps());
  assert.match(texto(r), /Posso mostrar/);
  r = await tratar(menu(), 'o dólar vai subir?', deps());
  assert.match(texto(r), /não faço previsão de preço/);
  assert.doesNotMatch(texto(r), /AwesomeAPI/);
});

test('cerebro: com as chaves desligadas, tudo responde EM_BREVE e nada é consultado', async () => {
  let chamou = false;
  const d = deps({
    precosAtivo: false,
    climaAtivo: false,
    dolar: async () => { chamou = true; return 'x'; },
    clima: async () => { chamou = true; return { tipo: 'ok', texto: 'x' }; },
  });
  for (const t of ['dólar', 'preço da soja', 'como está o tempo em Mandaguari', '5']) {
    assert.match(texto(await tratar(menu(), t, d)), /ainda não está pronta/, t);
  }
  assert.equal(chamou, false);
});

test('voz: dólar e clima podem ser falados (graus e milímetros por extenso)', () => {
  assert.match(paraFala('17° a 26°, chuva de 3,6 mm'), /17 graus a 26 graus, chuva de 3,6 milímetros/);
  assert.ok(escolherFala([{ intencao: 'dolar', texto: 'Dólar agora: compra R$ 5,56.' }]));
});

// Consultas externas reais (sem chave): dólar (AwesomeAPI) e clima (Open-Meteo). Timeout de 5 s, sem nova tentativa:
// quem chama troca qualquer erro pela resposta de fallback (CONSULTA_FALHOU). Só informação: nada de previsão de preço
// nem de colheita, e nenhuma recomendação.

const TIMEOUT_MS = 5000;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

async function pegarJson(url, fetchFn = fetch) {
  const r = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// ---------- Dólar ----------
async function dolar({ fetchFn } = {}) {
  const j = await pegarJson('https://economia.awesomeapi.com.br/json/last/USD-BRL', fetchFn);
  const d = j && j.USDBRL;
  const compra = Number(d && d.bid);
  const venda = Number(d && d.ask);
  const pct = Number(d && d.pctChange);
  const ts = Number(d && d.timestamp);
  if (!d || !Number.isFinite(compra) || !Number.isFinite(venda)) throw new Error('resposta sem cotação');
  const quando = Number.isFinite(ts) && ts > 0
    ? new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ').replace(' ', ' ')
    : String(d.create_date || '');
  const variacao = Number.isFinite(pct) ? ` Variação do dia: ${pct > 0 ? '+' : ''}${num(pct)}%.` : '';
  return `Dólar agora: compra R$ ${num(compra, 4)} e venda R$ ${num(venda, 4)}.${variacao} Cotação de ${quando}.\nFonte: AwesomeAPI.`;
}

// ---------- Clima ----------
async function clima(cidade, { fetchFn } = {}) {
  const nome = String(cidade || '').trim().slice(0, 60);
  if (!nome) return { tipo: 'sem_cidade' };
  const g = await pegarJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt&countryCode=BR`, fetchFn);
  const lugar = g && g.results && g.results[0];
  if (!lugar) return { tipo: 'nao_encontrada' };
  const f = await pegarJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=5', fetchFn);
  const d = f && f.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length) throw new Error('resposta sem dias');
  const linhas = d.time.map((dia, i) => {
    const [a, m, dd] = dia.split('-').map(Number);
    const sem = DIAS[new Date(Date.UTC(a, m - 1, dd, 12)).getUTCDay()];
    const mm = Number(d.precipitation_sum[i]);
    const chuva = mm > 0 ? `chuva de ${num(mm, 1)} mm` : 'sem chuva';
    return `${sem} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}: ${Math.round(d.temperature_2m_min[i])}° a ${Math.round(d.temperature_2m_max[i])}°, ${chuva}`;
  });
  const onde = lugar.admin1 ? `${lugar.name}, ${lugar.admin1}` : lugar.name;
  return { tipo: 'ok', texto: `Tempo em ${onde}, próximos 5 dias:\n${linhas.join('\n')}\nFonte: Open-Meteo. É informação do tempo, não previsão de colheita.` };
}

const ligado = (v) => String(process.env[v] || '').toLowerCase() === 'true';
const precosAtivo = () => ligado('PRECOS_ATIVO'); // dólar e cotações da demonstração
const climaAtivo = () => ligado('CLIMA_ATIVO');

module.exports = { dolar, clima, precosAtivo, climaAtivo, TIMEOUT_MS };

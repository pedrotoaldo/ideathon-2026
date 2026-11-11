// Cliente do chat compatível com a OpenAI (hoje Gemini, provisório). Só chat/completions + response_format.
// Troca de provedor = LLM_BASE_URL, LLM_API_KEY e LLM_MODEL_CHAT no .env.

class LlmIndisponivel extends Error {
  constructor(msg) { super(msg); this.name = 'LlmIndisponivel'; }
}

const TENTATIVAS = 3; // 1 chamada + até 2 novas tentativas
const ESPERA_MS = [400, 900];
const RETENTAVEL = new Set([408, 429, 500, 502, 503, 504]);

function tirarCercas(texto) {
  return String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// Devolve o objeto JSON da resposta, ou null se não for JSON válido
function parseJsonResposta(conteudo) {
  try {
    const v = JSON.parse(tirarCercas(conteudo));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Alguns modelos (ex.: OpenAI mais novos) só aceitam a temperatura padrão. Se o provedor recusar, o bot passa a omitir o campo.
let semTemperatura = process.env.LLM_TEMPERATURE === 'omitir';

// Chamada comum: devolve o texto da resposta (json = true pede response_format json_object)
async function chamar({ system, user, json, temperatura = 0, fetchFn = fetch }) {
  const base = String(process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
  const url = base + '/chat/completions';
  const timeout = Number(process.env.LLM_TIMEOUT_MS) || 12000;
  const montarCorpo = () => JSON.stringify({
    model: process.env.LLM_MODEL_CHAT,
    ...(semTemperatura ? {} : { temperature: temperatura }),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let ultimoErro = 'sem tentativa';
  for (let i = 0; i < TENTATIVAS; i++) {
    const mandouTemperatura = !semTemperatura; // chamadas simultâneas podem ter saído antes de a flag virar
    try {
      const r = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.LLM_API_KEY },
        body: montarCorpo(),
        signal: AbortSignal.timeout(timeout),
      });
      if (r.ok) {
        const j = await r.json();
        return j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      }
      ultimoErro = 'HTTP ' + r.status;
      if (r.status === 400 && mandouTemperatura && /temperature/i.test(await r.text().catch(() => ''))) {
        semTemperatura = true; // refaz já, sem gastar uma das novas tentativas
        i--;
        continue;
      }
      if (!RETENTAVEL.has(r.status)) break; // erro definitivo (chave, modelo, requisição)
    } catch (e) {
      ultimoErro = e.name === 'TimeoutError' ? 'timeout' : (e.cause && e.cause.code) || e.message; // rede também é retentável
    }
    if (i < TENTATIVAS - 1) await dormir(ESPERA_MS[i]);
  }
  throw new LlmIndisponivel('LLM indisponível: ' + ultimoErro);
}

// Extração estruturada: objeto JSON ou null
async function chatJson(opcoes) {
  return parseJsonResposta(await chamar({ ...opcoes, json: true }));
}

// Texto livre (redator tributário)
async function chatTexto(opcoes) {
  const t = await chamar({ ...opcoes, json: false });
  return typeof t === 'string' ? t.trim() : '';
}

module.exports = { chatJson, chatTexto, parseJsonResposta, LlmIndisponivel };

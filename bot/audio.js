// Áudio da IAra (Etapa 5): transcrição e voz pela OpenAI (AUDIO_*), separados do chat (LLM_*).
// AUDIO_ATIVO=false desliga tudo (áudio recebido volta a responder AUDIO_AINDA_NAO).

const LIMITE_FALA = 400; // caracteres; acima disso a IAra só manda o texto
const FIXOS_SEM_AUDIO = ['menu', 'boas_vindas', 'limite', 'manutencao', 'fora_escopo', 'erro', 'erro_llm', 'apagar', 'audio', 'so_texto', 'texto_longo', 'audio_ainda_nao', 'audio_nao_entendi', 'audio_longo'];

function audioAtivo(env = process.env) {
  return String(env.AUDIO_ATIVO || '').toLowerCase() === 'true' && !!env.AUDIO_API_KEY;
}

function base() {
  return String(process.env.AUDIO_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// POST com 1 nova tentativa em erro de servidor, 429 ou timeout
async function postar(url, opcoes, { fetchFn = fetch, tentativas = 2, timeoutMs = 20000 } = {}) {
  let erro = 'sem tentativa';
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetchFn(url, { ...opcoes, signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return r;
      erro = 'HTTP ' + r.status;
      if (![408, 429, 500, 502, 503, 504].includes(r.status)) break;
    } catch (e) {
      erro = e.name === 'TimeoutError' ? 'timeout' : (e.cause && e.cause.code) || e.message;
    }
    if (i < tentativas - 1) await dormir(600);
  }
  throw new Error(erro);
}

function extensao(mimetype) {
  const m = String(mimetype || '').toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  return 'ogg'; // WhatsApp: audio/ogg; codecs=opus
}

// Contexto curto para o Whisper acertar palavras curtas ("sim" não vira "fim"). Pode ser trocado em AUDIO_PROMPT_TRANSCRICAO.
const PROMPT_TRANSCRICAO = 'Conversa de WhatsApp com a IAra, assistente do produtor rural. Safra de soja, milho e trigo: hectares, alqueires, sacas por hectare, preço da saca, custo. Respostas comuns: sim, não, isso, pode, certo, certinho, ok, manda, vai.';

// Áudio (Buffer) -> texto em português. Devolve '' se a transcrição vier vazia.
async function transcrever(buffer, mimetype, { fetchFn } = {}) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: String(mimetype || 'audio/ogg').split(';')[0] }), 'audio.' + extensao(mimetype));
  form.append('model', process.env.AUDIO_MODEL_TRANSCRICAO || 'whisper-1');
  form.append('language', 'pt');
  form.append('prompt', process.env.AUDIO_PROMPT_TRANSCRICAO || PROMPT_TRANSCRICAO);
  form.append('response_format', 'json');
  const r = await postar(base() + '/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.AUDIO_API_KEY },
    body: form,
  }, { fetchFn });
  const j = await r.json();
  return String((j && j.text) || '').trim();
}

// Como a IAra deve soar (parâmetro instructions do /audio/speech); pode ser trocado em TTS_INSTRUCOES.
// É só estilo de voz: a IAra continua se apresentando como assistente virtual e não dá diagnóstico (isso vai ao agrônomo).
const INSTRUCOES_VOZ = [
  'Voice: A young Brazilian woman in her mid-twenties, recently graduated, speaking Brazilian Portuguese with a neutral accent. Light, bright and youthful voice; never mature, never deep, never like a news anchor or a call center.',
  'Tone: Warm, friendly and confident, like talking to a farmer she knows well. Smiling while she speaks.',
  'Pacing: Slightly faster than normal conversational speed, lively and energetic, with short pauses between ideas; never slow or drawn out.',
  'Emotion: Genuinely interested and encouraging; calm when giving bad news.',
  'Pronunciation: Clear and relaxed, everyday Brazilian Portuguese, not formal.',
].join(' ');

// Texto -> áudio em base64 (mp3 por padrão; a Evolution converte em nota de voz)
async function sintetizar(texto, { fetchFn } = {}) {
  const modelo = process.env.AUDIO_MODEL_TTS || 'gpt-4o-mini-tts';
  const corpo = {
    model: modelo,
    voice: process.env.TTS_VOZ || 'nova',
    input: texto,
    response_format: process.env.TTS_FORMATO || 'mp3',
  };
  const velocidade = Number(process.env.TTS_VELOCIDADE || 1.15); // 1 = normal; a API aceita de 0,25 a 4
  if (velocidade > 0 && velocidade !== 1) corpo.speed = Math.min(4, Math.max(0.25, velocidade));
  if (!/^tts-1/.test(modelo)) corpo.instructions = process.env.TTS_INSTRUCOES || INSTRUCOES_VOZ; // sempre enviado (tts-1 não aceita)
  const r = await postar(base() + '/audio/speech', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.AUDIO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }, { fetchFn });
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

// Ajustes para a voz ler bem (siglas e símbolos). Os números continuam os mesmos.
function paraFala(texto) {
  return String(texto || '')
    .replace(/[••]/g, ' ')
    .replace(/R\$\s*(\d+(?:[.,]\d+)*)/g, '$1 reais')
    .replace(/°/g, ' graus')
    .replace(/(\d)\s*mm\b/g, '$1 milímetros')
    .replace(/sc\/ha/gi, 'sacas por hectare')
    .replace(/sacas\/ha/gi, 'sacas por hectare')
    .replace(/(\d)\s*ha\b/g, '$1 hectares')
    .replace(/R\$/g, 'reais')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Escolhe o que falar entre as respostas do grupo: o resumo falado da conta (resposta com `falado`),
// senão a primeira resposta que não seja texto fixo curto, se tiver até ~400 caracteres. null = só texto.
function escolherFala(respostas) {
  for (const r of respostas) if (r.falado) return r.falado;
  const r = respostas.find((x) => !FIXOS_SEM_AUDIO.includes(x.intencao));
  if (!r || String(r.texto).length > LIMITE_FALA) return null;
  return paraFala(r.texto);
}

module.exports = { INSTRUCOES_VOZ, audioAtivo, transcrever, sintetizar, paraFala, escolherFala, extensao, LIMITE_FALA };

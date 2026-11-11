// Pipeline de cada mensagem (docs/ARCHITECTURE.md seção 3).
// Parte A (por mensagem): filtros, modo teste, idempotência, kill switch, limite (em memória), texto acima de 800 caracteres; texto entra no agrupamento (debounce).
// Parte B (por grupo de mensagens do mesmo número): boas-vindas ou máquina de estados (cerebro.js).
// I/O (banco e Evolution) fica aqui; as decisões de conversa ficam no cerebro.js.

const T = require('./textos');
const db = require('./db');
const { enviarTexto, enviarPresenca, baixarMidia, enviarAudio, ehSimulado } = require('./evolution');
const { audioAtivo, transcrever, sintetizar, escolherFala } = require('./audio');
const { normalizar, mascarar } = require('./normalizar');
const { permitido } = require('./acesso');
const { tratar } = require('./cerebro');
const { extrair } = require('./extracao');
const { responder: responderTributario } = require('./tributario');
const consultas = require('./consultas');
const { criarDebounce } = require('./debounce');
const { enfileirar } = require('./fila');
const { registrar } = require('./limite');
const { pedeApagar, rotear } = require('./roteador');
const { expirou, reiniciarDados, EM_FLUXO } = require('./expiracao');

const MAX_CARACTERES = 800;

function inteiroDoEnv(valor, padrao) {
  if (valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return padrao;
  return Number(valor);
}
const DEBOUNCE_MS = inteiroDoEnv(process.env.DEBOUNCE_MS, 2500);
const DEBOUNCE_MAX_MS = inteiroDoEnv(process.env.DEBOUNCE_MAX_MS, 12000);

function log(m, intencao, t0, extra = '') {
  const hora = new Date().toTimeString().slice(0, 8);
  console.log(`[${hora}] ${mascarar(m.numero)} tipo=${m.tipo} intencao=${intencao} ${Date.now() - t0}ms${extra ? ' ' + extra : ''}`);
}

// Envia e registra uma resposta ligada a uma mensagem (a última do grupo, quando há agrupamento)
function criarResponder(m, t0) {
  return async function responder(texto, intencao, { usou_llm = false, versao_prompt = null } = {}) {
    try {
      await enviarTexto(m.destino, texto);
    } catch (e) {
      console.error(`[envio] falhou para ${mascarar(m.numero)}: ${e.message}`);
    }
    await db.registrarResposta({ message_id: m.message_id, numero: m.numero, intencao, texto, usou_llm, versao_prompt, latencia_ms: Date.now() - t0 });
  };
}

// "Digitando..." enquanto espera a janela fechar; se falhar, segue sem ela
const ultimaPresenca = new Map();
let avisouFalhaPresenca = false;
function mostrarDigitando(m) {
  if (DEBOUNCE_MS <= 0) return;
  const agora = Date.now();
  if (agora - (ultimaPresenca.get(m.numero) || 0) < DEBOUNCE_MS * 0.7) return;
  ultimaPresenca.set(m.numero, agora);
  enviarPresenca(m.destino, DEBOUNCE_MS + 500).catch((e) => {
    if (!avisouFalhaPresenca) { avisouFalhaPresenca = true; console.warn(`[presença] indisponível, seguindo sem ela: ${e.message}`); }
  });
}

const grupo = criarDebounce({
  ms: DEBOUNCE_MS,
  maxMs: DEBOUNCE_MAX_MS,
  aoAdicionar: (numero, item) => mostrarDigitando(item.m),
  aoFechar: (numero, itens) => { enfileirar(numero, () => responderGrupo(numero, itens)); },
});

// ---------- Áudio (Etapa 5) ----------
const MAX_SEGUNDOS_AUDIO = 60;

async function transcreverAudio(m) {
  if (ehSimulado(m.numero)) return m.transcricao_simulada || ''; // números fictícios nunca chamam a OpenAI
  const { base64, mimetype } = await baixarMidia(m);
  return transcrever(Buffer.from(base64, 'base64'), mimetype);
}

// Voz da IAra: falha em qualquer ponto = só texto, sem erro para o usuário
async function falar(m, texto, t0) {
  try {
    if (!ehSimulado(m.destino)) {
      const b64 = await sintetizar(texto);
      await enviarAudio(m.destino, b64);
    }
    await db.registrarResposta({ message_id: m.message_id, numero: m.numero, intencao: 'audio', texto: '[áudio] ' + texto, usou_llm: false, latencia_ms: Date.now() - t0 });
    return true;
  } catch (e) {
    console.error(`[voz] falhou para ${mascarar(m.numero)}, seguindo só com texto: ${e.message}`);
    return false;
  }
}

// ---------- Parte A: uma mensagem ----------
async function processar(evento) {
  const t0 = Date.now();
  const m = normalizar(evento);
  if (!m) return;

  if (m.fromMe || m.isGroup || m.isStatus || m.tipo === 'ignorar') {
    log(m, 'ignorada', t0, m.fromMe ? '(fromMe)' : m.isGroup ? '(grupo)' : m.isStatus ? '(status)' : '(tipo sem tratamento)');
    return;
  }

  // Modo teste: fora da lista (BOT_SOMENTE_NUMEROS) não responde nem grava nada
  if (!permitido(m.numero)) {
    log(m, 'ignorada', t0, '(fora da lista de teste)');
    return;
  }

  // Idempotência: cada message_id é processado uma única vez
  if (!(await db.registrarMensagem(m))) {
    log(m, 'duplicada', t0);
    return;
  }

  const responder = criarResponder(m, t0);
  try {
    // Kill switch
    if (!(await db.config('bot_ativo', true))) {
      await responder(T.MANUTENCAO, 'manutencao');
      log(m, 'manutencao', t0);
      return;
    }

    // Limite por número (padrão: 20 mensagens em 10 min), contado em memória: "apagar meus dados" não zera
    const lim = await db.config('rate_limit', { mensagens: 20, janela_min: 10 });
    const l = registrar(m.numero, lim);
    if (l.excedeu && !pedeApagar(m.texto)) { // quem estourou o limite ainda pode pedir para apagar os dados
      if (l.avisar) {
        await responder(T.LIMITE, 'limite');
        log(m, 'limite', t0);
      } else {
        log(m, 'limite_silencioso', t0);
      }
      return;
    }

    // Texto longo demais: pede versão curta (também protege o LLM de entrada enorme)
    if (m.tipo === 'texto' && String(m.texto || '').length > MAX_CARACTERES) {
      await responder(T.TEXTO_LONGO, 'texto_longo');
      log(m, 'texto_longo', t0);
      return;
    }

    if (m.tipo === 'audio' && !audioAtivo()) {
      await db.carregarConversa(m.numero);
      await responder(T.AUDIO_AINDA_NAO, 'audio_ainda_nao');
      log(m, 'audio_ainda_nao', t0);
    } else if (m.tipo === 'audio') {
      // Transcreve e segue como texto, passando pelo agrupamento
      if (m.duracao_audio && m.duracao_audio > MAX_SEGUNDOS_AUDIO) {
        await db.carregarConversa(m.numero);
        await responder(T.AUDIO_LONGO, 'audio_longo');
        log(m, 'audio_longo', t0);
        return;
      }
      let texto = '';
      try {
        texto = await transcreverAudio(m);
      } catch (e) {
        console.error(`[transcrição] falhou para ${mascarar(m.numero)}: ${e.message}`);
      }
      if (!texto) {
        await db.carregarConversa(m.numero);
        await responder(T.AUDIO_NAO_ENTENDI, 'audio_nao_entendi');
        log(m, 'audio_nao_entendi', t0);
        return;
      }
      db.setTextoMensagem(m.message_id, texto).catch(() => {}); // guarda a transcrição (ajuda a diagnosticar)
      grupo.adicionar(m.numero, { m: { ...m, texto, deAudio: true }, t0 });
    } else if (m.tipo === 'midia') {
      await db.carregarConversa(m.numero);
      await responder(T.SO_TEXTO_AUDIO, 'so_texto');
      log(m, 'so_texto', t0);
    } else {
      grupo.adicionar(m.numero, { m, t0 }); // o resto acontece quando a janela fechar
    }
  } catch (e) {
    console.error(`[erro] ${mascarar(m.numero)}: ${e.stack || e.message}`);
    try { await responder(T.ERRO_TEMPORARIO, 'erro'); } catch (_) { /* nada a fazer */ }
    log(m, 'erro', t0);
  }
}

// ---------- Parte B: um grupo de mensagens de texto do mesmo número ----------
async function responderGrupo(numero, itens) {
  const m = itens[itens.length - 1].m; // as respostas ficam ligadas à última mensagem do grupo
  const t0 = itens[0].t0; // a latência conta desde a primeira
  const texto = itens.map((i) => i.m.texto).filter(Boolean).join('\n');
  const temAudio = itens.some((i) => i.m.deAudio);
  const extra = [itens.length > 1 ? `agrupadas=${itens.length}` : '', temAudio ? 'audio' : ''].filter(Boolean).join(' ');
  const responder = criarResponder(m, t0);
  let intencao = 'erro';

  try {
    const conversa = await db.carregarConversa(m.numero);

    // Conversa parada há mais de 30 min (config.conversa_expira_min): descarta o fluxo e volta ao menu, mantendo a última conta
    if (expirou(conversa, await db.config('conversa_expira_min', 30))) {
      const eraFluxo = EM_FLUXO.includes(conversa.estado);
      conversa.dados = reiniciarDados(conversa.dados);
      conversa.estado = 'menu';
      await db.salvarEstado(m.numero, 'menu', conversa.dados);
      if (eraFluxo && rotear(texto, 'menu').intencao === 'ambiguo') {
        // o que o produtor mandou respondia a uma pergunta que já ficou para trás: recebe o menu
        intencao = 'menu_expirada';
        await responder(T.MENU, 'menu');
        log(m, intencao, t0, extra);
        return;
      }
    }

    if (conversa.estado === 'novo') {
      intencao = 'boas_vindas';
      await responder(T.BOAS_VINDAS, intencao);
      await responder(T.MENU, intencao);
      await db.salvarEstado(m.numero, 'menu');
    } else {
      const faixasCultura = await db.config('faixas_cultura', undefined);
      const limitesSanidade = await db.config('limites_sanidade', undefined);
      const r = await tratar(conversa, texto, { extrair, faixasCultura, limitesSanidade, tributario: responderTributario, audioAtivo: audioAtivo(),
        precosAtivo: consultas.precosAtivo(), climaAtivo: consultas.climaAtivo(), dolar: consultas.dolar, clima: consultas.clima });
      if (r.acao === 'apagar') {
        // Confirma por mensagem e apaga tudo do número (a própria confirmação não fica registrada)
        intencao = 'apagar';
        grupo.cancelar(m.numero);
        try { await enviarTexto(m.destino, r.respostas[0].texto); } catch (e) { console.error(`[envio] falhou: ${e.message}`); }
        await db.apagarDados(m.numero);
        log(m, intencao, t0, extra);
        return;
      }
      if (r.acao === 'encaminhar') await db.registrarEncaminhamento({ numero: m.numero, motivo: r.motivo || 'pedido_usuario', contexto: r.contexto || null });
      // Preferência de áudio: comando explícito, ou áudio recebido liga
      let querAudio = !!conversa.responde_audio;
      if (r.responde_audio !== undefined) querAudio = r.responde_audio;
      else if (temAudio) querAudio = true;
      if (audioAtivo()) {
        if (querAudio !== !!conversa.responde_audio) await db.setRespondeAudio(m.numero, querAudio);
        const fala = querAudio ? escolherFala(r.respostas) : null;
        if (fala) await falar(m, fala, t0); // áudio primeiro, texto com os números logo depois
      }
      for (const x of r.respostas) {
        intencao = x.intencao;
        await responder(x.texto, x.intencao, { usou_llm: x.usou_llm, versao_prompt: x.usou_llm ? r.versao_prompt : null });
      }
      await db.salvarEstado(m.numero, r.estado, r.dados);
    }
    log(m, intencao, t0, extra);
  } catch (e) {
    if (e.name === 'LlmIndisponivel') {
      // LLM fora: ERRO_TEMPORARIO e menu numérico (o cálculo e o menu não dependem do LLM)
      console.error(`[llm] ${mascarar(m.numero)}: ${e.message}`);
      try {
        await responder(T.ERRO_TEMPORARIO, 'erro_llm');
        await responder(T.MENU, 'erro_llm');
        await db.salvarEstado(m.numero, 'menu');
      } catch (e2) { console.error('[erro_llm] falha ao responder:', e2.message); }
      log(m, 'erro_llm', t0, extra);
      return;
    }
    console.error(`[erro] ${mascarar(m.numero)}: ${e.stack || e.message}`);
    try { await responder(T.ERRO_TEMPORARIO, 'erro'); } catch (_) { /* nada a fazer */ }
    log(m, 'erro', t0, extra);
  }
}

module.exports = { processar, responderGrupo, DEBOUNCE_MS, DEBOUNCE_MAX_MS };

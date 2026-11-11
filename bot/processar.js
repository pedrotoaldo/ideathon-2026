// Pipeline de cada mensagem (docs/ARCHITECTURE.md seção 3): filtros, idempotência, kill switch, limite,
// boas-vindas e, daí em diante, a máquina de estados em cerebro.js. I/O (banco e Evolution) fica aqui.

const T = require('./textos');
const db = require('./db');
const { enviarTexto } = require('./evolution');
const { normalizar, mascarar } = require('./normalizar');
const { tratar } = require('./cerebro');
const { extrair } = require('./extracao');

function log(m, intencao, t0, extra = '') {
  const hora = new Date().toTimeString().slice(0, 8);
  console.log(`[${hora}] ${mascarar(m.numero)} tipo=${m.tipo} intencao=${intencao} ${Date.now() - t0}ms${extra ? ' ' + extra : ''}`);
}

async function processar(evento) {
  const t0 = Date.now();
  const m = normalizar(evento);
  if (!m) return;

  if (m.fromMe || m.isGroup || m.isStatus || m.tipo === 'ignorar') {
    log(m, 'ignorada', t0, m.fromMe ? '(fromMe)' : m.isGroup ? '(grupo)' : m.isStatus ? '(status)' : '(tipo sem tratamento)');
    return;
  }

  // Idempotência: cada message_id é processado uma única vez
  if (!(await db.registrarMensagem(m))) {
    log(m, 'duplicada', t0);
    return;
  }

  let intencao = 'erro';
  async function responder(texto, intencaoResposta = intencao, { usou_llm = false, versao_prompt = null } = {}) {
    try {
      await enviarTexto(m.destino, texto);
    } catch (e) {
      console.error(`[envio] falhou para ${mascarar(m.numero)}: ${e.message}`);
    }
    await db.registrarResposta({ message_id: m.message_id, numero: m.numero, intencao: intencaoResposta, texto, usou_llm, versao_prompt, latencia_ms: Date.now() - t0 });
  }

  try {
    // Kill switch
    if (!(await db.config('bot_ativo', true))) {
      intencao = 'manutencao';
      await responder(T.MANUTENCAO);
      log(m, intencao, t0);
      return;
    }

    // Limite por número (padrão: 20 mensagens em 10 min)
    const lim = await db.config('rate_limit', { mensagens: 20, janela_min: 10 });
    if ((await db.contarMensagens(m.numero, lim.janela_min)) > lim.mensagens) {
      await db.carregarConversa(m.numero);
      if (await db.jaAvisouLimite(m.numero, lim.janela_min)) {
        log(m, 'limite_silencioso', t0);
      } else {
        intencao = 'limite';
        await responder(T.LIMITE);
        log(m, intencao, t0);
      }
      return;
    }

    const conversa = await db.carregarConversa(m.numero);

    if (m.tipo === 'audio') {
      intencao = 'audio_ainda_nao';
      await responder(T.AUDIO_AINDA_NAO);
    } else if (m.tipo === 'midia') {
      intencao = 'so_texto';
      await responder(T.SO_TEXTO_AUDIO);
    } else if (conversa.estado === 'novo') {
      intencao = 'boas_vindas';
      await responder(T.BOAS_VINDAS);
      await responder(T.MENU);
      await db.salvarEstado(m.numero, 'menu');
    } else {
      const r = await tratar(conversa, m.texto, { extrair });
      for (const x of r.respostas) {
        intencao = x.intencao;
        await responder(x.texto, x.intencao, { usou_llm: x.usou_llm, versao_prompt: x.usou_llm ? r.versao_prompt : null });
      }
      await db.salvarEstado(m.numero, r.estado, r.dados);
    }
    log(m, intencao, t0);
  } catch (e) {
    if (e.name === 'LlmIndisponivel') {
      // LLM fora: ERRO_TEMPORARIO e menu numérico (o cálculo e o menu não dependem do LLM)
      console.error(`[llm] ${mascarar(m.numero)}: ${e.message}`);
      intencao = 'erro_llm';
      try {
        await responder(T.ERRO_TEMPORARIO);
        await responder(T.MENU);
        await db.salvarEstado(m.numero, 'menu');
      } catch (e2) { console.error('[erro_llm] falha ao responder:', e2.message); }
      log(m, 'erro_llm', t0);
      return;
    }
    console.error(`[erro] ${mascarar(m.numero)}: ${e.stack || e.message}`);
    intencao = 'erro';
    try { await responder(T.ERRO_TEMPORARIO); } catch (_) { /* nada a fazer */ }
    log(m, 'erro', t0);
  }
}

module.exports = { processar };

// Pipeline de cada mensagem (docs/ARCHITECTURE.md seção 3). Etapa 1: filtros, idempotência,
// kill switch, limite, boas-vindas e menu. O roteamento de safra, tributário e alerta entra nas próximas etapas.

const T = require('./textos');
const db = require('./db');
const { enviarTexto } = require('./evolution');
const { normalizar, mascarar } = require('./normalizar');

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
  async function responder(texto) {
    try {
      await enviarTexto(m.destino, texto);
    } catch (e) {
      console.error(`[envio] falhou para ${mascarar(m.numero)}: ${e.message}`);
    }
    await db.registrarResposta({ message_id: m.message_id, numero: m.numero, intencao, texto, latencia_ms: Date.now() - t0 });
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
      // Etapa 1: qualquer texto devolve o menu. O roteador por regras entra na Etapa 2.
      intencao = 'menu';
      await responder(T.MENU);
    }
    log(m, intencao, t0);
  } catch (e) {
    console.error(`[erro] ${mascarar(m.numero)}: ${e.stack || e.message}`);
    intencao = 'erro';
    try { await responder(T.ERRO_TEMPORARIO); } catch (_) { /* nada a fazer */ }
    log(m, 'erro', t0);
  }
}

module.exports = { processar };

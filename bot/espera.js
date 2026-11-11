// Mensagem de espera: se a resposta demora mais que ESPERA_MS (padrão 3 s) por causa de LLM, transcrição ou API externa,
// manda antes uma mensagem FIXA ("Só um instante, já te respondo."). No máximo uma por mensagem do produtor;
// nunca é gerada pela IA. ESPERA_MS=0 desliga.

const T = require('./textos');

const MAX_RASTREADOS = 1000;
const avisadosGlobal = new Set(); // message_id que já recebeu o aviso

function msDoEnv(valor, padrao = 3000) {
  if (valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return padrao;
  return Number(valor);
}

// enviar(texto): manda e registra o aviso. messageIds: as mensagens do produtor que esta resposta atende.
function criarAvisoDeEspera({ enviar, ms = msDoEnv(process.env.ESPERA_MS), avisados = avisadosGlobal } = {}) {
  let timer = null;
  return {
    iniciar(messageIds) {
      const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean);
      this.cancelar();
      if (!(ms > 0) || !ids.length || ids.some((id) => avisados.has(id))) return;
      timer = setTimeout(async () => {
        timer = null;
        for (const id of ids) avisados.add(id);
        while (avisados.size > MAX_RASTREADOS) avisados.delete(avisados.values().next().value);
        try { await enviar(T.ESPERA); } catch (e) { console.error('[espera] falhou ao enviar o aviso: ' + e.message); }
      }, ms);
      if (timer.unref) timer.unref();
    },
    cancelar() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

module.exports = { criarAvisoDeEspera, msDoEnv };

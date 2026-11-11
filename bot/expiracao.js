// Expiração da conversa: depois de N minutos sem mensagem, o fluxo em andamento é descartado e a próxima mensagem
// começa do menu. A última conta calculada é mantida (para "e se" e "resumo").

const EM_FLUXO = ['coletando_safra', 'confirmando_safra', 'perfil_tributario', 'criando_alerta'];
// aguardando_resposta_alerta não expira: o produtor pode responder ao alerta horas depois
const NAO_EXPIRA = ['novo', 'aguardando_resposta_alerta'];

function expirou(conversa, minutos = 30, agora = Date.now()) {
  if (!conversa || NAO_EXPIRA.includes(conversa.estado) || !conversa.atualizado_em || !(minutos > 0)) return false;
  return agora - new Date(conversa.atualizado_em).getTime() > minutos * 60000;
}

// Dados depois da expiração: some o que estava em andamento; fica a última conta, o perfil completo e o alerta
function reiniciarDados(dados) {
  const d = JSON.parse(JSON.stringify(dados || {}));
  const u = d.ultimo_calculo;
  if (u && u.entrada) d.safra = { ...u.entrada, cultura: u.cultura || null };
  else delete d.safra;
  if (d.perfil && d.perfil.etapa) delete d.perfil; // perguntas do perfil pela metade
  delete d.coleta;
  d.nao_sei = null;
  return d;
}

module.exports = { expirou, reiniciarDados, EM_FLUXO };

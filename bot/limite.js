// Limite de mensagens por número, em memória (janela deslizante). Fica fora do banco de propósito:
// "apagar meus dados" apaga linhas do Postgres, mas não zera esta contagem. Um processo só (Plus 5 para vários).

const janelas = new Map(); // numero -> { tempos: number[], avisouEm: number }

// Registra uma mensagem. Retorna { excedeu, avisar }: avisar = true só na primeira vez que excede em cada janela.
function registrar(numero, { mensagens, janela_min }, agora = Date.now()) {
  const janelaMs = janela_min * 60 * 1000;
  let j = janelas.get(numero);
  if (!j) { j = { tempos: [], avisouEm: 0 }; janelas.set(numero, j); }
  j.tempos = j.tempos.filter((t) => agora - t < janelaMs);
  j.tempos.push(agora);
  const excedeu = j.tempos.length > mensagens;
  let avisar = false;
  if (excedeu && agora - j.avisouEm >= janelaMs) { j.avisouEm = agora; avisar = true; }
  return { excedeu, avisar };
}

// Limpeza de números parados, para a memória não crescer
function limpar(janelaMin, agora = Date.now()) {
  for (const [n, j] of janelas) {
    if (!j.tempos.length || agora - j.tempos[j.tempos.length - 1] > janelaMin * 60 * 1000) janelas.delete(n);
  }
}
setInterval(() => limpar(10), 10 * 60 * 1000).unref();

module.exports = { registrar, limpar, _janelas: janelas };

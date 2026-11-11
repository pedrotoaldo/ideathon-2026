// Agrupamento de mensagens por número, em memória (um processo só; para vários processos seria Redis: Plus 5).
// Janela de `ms` reiniciada a cada mensagem nova, com limite de `maxMs` desde a primeira do grupo.

function criarDebounce({ ms, maxMs, aoFechar, aoAdicionar }) {
  const buffers = new Map();

  function fechar(chave) {
    const b = buffers.get(chave);
    if (!b) return;
    clearTimeout(b.timer);
    buffers.delete(chave);
    aoFechar(chave, b.itens);
  }

  function adicionar(chave, item) {
    const agora = Date.now();
    let b = buffers.get(chave);
    if (!b) {
      b = { itens: [], inicio: agora, timer: null };
      buffers.set(chave, b);
    }
    b.itens.push(item);
    clearTimeout(b.timer);
    const restante = maxMs - (agora - b.inicio);
    b.timer = setTimeout(() => fechar(chave), Math.max(0, Math.min(ms, restante)));
    if (aoAdicionar) aoAdicionar(chave, item, b.itens.length);
  }

  function cancelar(chave) {
    const b = buffers.get(chave);
    if (!b) return;
    clearTimeout(b.timer);
    buffers.delete(chave);
  }

  return { adicionar, fechar, cancelar, pendentes: () => buffers.size };
}

module.exports = { criarDebounce };

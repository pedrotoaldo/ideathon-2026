// Fila por número: tarefas do mesmo número rodam em sequência; números diferentes rodam em paralelo.

const filas = new Map();

function enfileirar(chave, tarefa) {
  const anterior = filas.get(chave) || Promise.resolve();
  const atual = anterior.then(tarefa).catch((e) => console.error('[fila]', e.stack || e.message)).finally(() => {
    if (filas.get(chave) === atual) filas.delete(chave);
  });
  filas.set(chave, atual);
  return atual;
}

module.exports = { enfileirar };

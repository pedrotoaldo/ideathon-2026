// Respostas longas (acima de ~600 caracteres) vão em até 3 mensagens, divididas por parágrafo.
// Nunca corta no meio de frase, número ou link: só quebra nas linhas em branco (ou, sem elas, nas quebras de linha).

const LIMITE = 600;
const MAX_MENSAGENS = 3;

function dividirResposta(texto, { limite = LIMITE, max = MAX_MENSAGENS } = {}) {
  const t = String(texto == null ? '' : texto).trim();
  if (t.length <= limite || max < 2) return [t];

  let sep = '\n\n';
  let unidades = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (unidades.length < 2) {
    sep = '\n';
    unidades = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
  }
  if (unidades.length < 2) return [t]; // sem ponto de corte seguro: vai inteira

  const partes = [];
  let atual = '';
  for (const u of unidades) {
    if (atual && (atual + sep + u).length > limite && partes.length < max - 1) {
      partes.push(atual);
      atual = u;
    } else {
      atual = atual ? atual + sep + u : u;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

module.exports = { dividirResposta, LIMITE, MAX_MENSAGENS };

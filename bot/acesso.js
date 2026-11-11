// Modo teste: se BOT_SOMENTE_NUMEROS estiver preenchido, o bot só responde a esses números.
// Os números fictícios do simulador (prefixo 5500) sempre passam: nunca são enviados de verdade.
// LEMBRETE: esvaziar BOT_SOMENTE_NUMEROS no .env quando o MVP estiver funcional (checklist em docs/DEMO_QR.md e docs/PLAN.md).

const { PREFIXO_SIMULADO } = require('./evolution');

// Números do Brasil aparecem com ou sem o 9 depois do DDD; compara as duas formas
function variantes(numero) {
  const n = String(numero).replace(/\D/g, '');
  const v = new Set([n]);
  if (/^55\d{2}9\d{8}$/.test(n)) v.add(n.slice(0, 4) + n.slice(5)); // 13 dígitos → sem o 9
  if (/^55\d{2}[6-9]\d{7}$/.test(n)) v.add(n.slice(0, 4) + '9' + n.slice(4)); // 12 dígitos → com o 9
  return v;
}

function listaPermitida(env = process.env.BOT_SOMENTE_NUMEROS) {
  return String(env || '').split(/[,\s;]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean);
}

function permitido(numero, env = process.env.BOT_SOMENTE_NUMEROS) {
  const lista = listaPermitida(env);
  if (!lista.length) return true; // sem restrição
  if (String(numero).startsWith(PREFIXO_SIMULADO)) return true;
  const quem = variantes(numero);
  return lista.some((p) => [...variantes(p)].some((x) => quem.has(x)));
}

module.exports = { permitido, listaPermitida, variantes };

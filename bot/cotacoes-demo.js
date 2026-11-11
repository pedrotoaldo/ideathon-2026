// Cotações FICTÍCIAS da demonstração (soja, milho, trigo, boi gordo). Sem tabela e sem script de lançamento.
// Não alimentam o alerta de preço: o alerta continua com o disparo manual (scripts/disparar-alerta.mjs).
// No produto, a cotação vem oficial da cooperativa.

const PRACA = 'região de Mandaguari';
const AVISO = 'Valor ilustrativo da demonstração, não é cotação real. No produto, a cotação vem oficial da cooperativa.';

const PRODUTOS = {
  soja: { nome: 'soja', valor: 138, unidade: 'saca' },
  milho: { nome: 'milho', valor: 68, unidade: 'saca' },
  trigo: { nome: 'trigo', valor: 82, unidade: 'saca' },
  boi: { nome: 'boi gordo', valor: 345, unidade: 'arroba' },
};

function hoje(agora = new Date()) {
  return agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const reais = (v) => 'R$ ' + String(v);

function linha(p, agora) {
  return `${p.nome[0].toUpperCase()}${p.nome.slice(1)}: ${reais(p.valor)} por ${p.unidade} (${PRACA}, ${hoje(agora)}).`;
}

// chave: soja | milho | trigo | boi; sem chave, todas
function responder(chave, agora = new Date()) {
  const lista = chave && PRODUTOS[chave] ? [PRODUTOS[chave]] : Object.values(PRODUTOS);
  return lista.map((p) => linha(p, agora)).join('\n') + '\n' + AVISO;
}

module.exports = { responder, PRODUTOS, AVISO, PRACA };

// Roteador por regra (docs/CONVERSA.md seção 2). O LLM só entra quando nenhuma regra resolve ("ambiguo").

const ESTADOS_DE_FLUXO = ['coletando_safra', 'confirmando_safra'];

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s%$,.]/gu, ' ')
    .replace(/[.,!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palavra inteira (ou frase) dentro do texto
function tem(t, lista) {
  return lista.some((p) => new RegExp('(^|\\s)' + p + '(\\s|$)').test(t));
}

const MENU = ['menu', 'voltar', 'inicio', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'];
const HUMANO = ['atendente', 'pessoa', 'falar com alguem', 'humano'];
const APAGAR = ['apagar meus dados', 'apaga meus dados'];
const GATILHO = ['me avisa quando', 'alerta de preco', 'avisa se passar', 'meus alertas', 'cancelar alerta'];
const TRIBUTARIO = ['reforma', 'imposto', 'impostos', 'tributo', 'tributos', 'ibs', 'cbs', 'contador', 'nota fiscal', 'contribuinte'];
const CLIMA = ['clima', 'tempo', 'chuva', 'previsao do tempo', 'temperatura'];
const PAINEL = ['painel', 'grafico', 'ver minha safra'];
const AUDIO = ['manda em audio', 'responde em audio', 'so texto', 'sem audio'];
const SAFRA = ['safra', 'conta', 'custo', 'saca', 'sacas', 'colher', 'colheita', 'hectare', 'hectares', 'alqueire', 'alqueires', 'prejuizo', 'lucro', 'e se'];

const CONFIRMA_FORTES = ['sim', 's', 'isso', 'certo', 'correto', 'ok', 'confirmo', 'exato', 'positivo', 'claro', 'pode'];
const CONFIRMA_FRACAS = ['mesmo', 'ser', 'esta', 'ta', 'ai', 'tudo', 'e'];
const NEGA = ['nao', 'n', 'errado', 'negativo', 'nao esta certo', 'ta errado', 'esta errado'];

function ehConfirmacao(texto) {
  const t = normalizarTexto(texto);
  const palavras = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!palavras.length || palavras.length > 5) return false;
  return palavras.some((p) => CONFIRMA_FORTES.includes(p)) && palavras.every((p) => CONFIRMA_FORTES.includes(p) || CONFIRMA_FRACAS.includes(p));
}

function ehNegacao(texto) {
  return NEGA.includes(normalizarTexto(texto));
}

// Retorna { intencao, eSe }
// intencao: menu | apagar | humano | tributario | gatilho | clima | painel | audio | resumo | safra | fluxo | ambiguo
function rotear(texto, estado) {
  const t = normalizarTexto(texto);
  if (MENU.includes(t)) return { intencao: 'menu' };
  if (APAGAR.some((p) => t.includes(p))) return { intencao: 'apagar' };
  if (t === '3' || tem(t, HUMANO)) return { intencao: 'humano' };
  // Dentro de um fluxo ativo, tudo é resposta do fluxo (exceto menu, 3 e apagar)
  if (ESTADOS_DE_FLUXO.includes(estado)) return { intencao: 'fluxo' };
  if (t === '4' || tem(t, GATILHO)) return { intencao: 'gatilho' };
  if (t === '2' || tem(t, TRIBUTARIO)) return { intencao: 'tributario' };
  if (tem(t, CLIMA)) return { intencao: 'clima' };
  if (tem(t, PAINEL)) return { intencao: 'painel' };
  if (tem(t, AUDIO)) return { intencao: 'audio' };
  if (t === 'resumo') return { intencao: 'resumo' };
  const eSe = tem(t, ['e se']);
  if (t === '1' || tem(t, SAFRA)) return { intencao: 'safra', eSe, soPedido: t === '1' || !/\d/.test(t) };
  return { intencao: 'ambiguo' };
}

module.exports = { rotear, normalizarTexto, ehConfirmacao, ehNegacao };

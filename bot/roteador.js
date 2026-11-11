// Roteador por regra (docs/CONVERSA.md seção 2). O LLM só entra quando nenhuma regra resolve ("ambiguo").

const ESTADOS_DE_FLUXO = ['coletando_safra', 'confirmando_safra', 'perfil_tributario', 'criando_alerta', 'clima_cidade'];

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
const HUMANO = ['atendente', 'pessoa', 'falar com alguem', 'falar com uma pessoa', 'falar com pessoa', 'atendimento humano', 'falar com humano'];
const APAGAR = ['apagar meus dados', 'apaga meus dados'];
const GATILHO = ['me avisa quando', 'me avisa se', 'alerta de preco', 'avisa se passar', 'criar alerta'];
const LISTA_ALERTAS = ['meus alertas', 'cancelar alerta', 'cancelar meu alerta']; // Plus 2
const TRIBUTARIO = ['reforma', 'imposto', 'impostos', 'tributo', 'tributos', 'ibs', 'cbs', 'contador', 'nota fiscal', 'contribuinte', 'regime', 'aliquota', 'simples nacional', 'credito presumido', 'lc 214'];
const AGRO_TECNICO = ['amarelada', 'amarelado', 'amarelando', 'praga', 'pragas', 'doenca', 'doencas', 'lagarta', 'ferrugem', 'fungo', 'mancha', 'manchas', 'adubar', 'adubacao', 'defensivo', 'veneno'];
// Tentativas de mudar as regras da IAra ou de ler o prompt: nem chegam ao LLM
const INJECAO = [
  /\b(ignor\w*|esquec\w*|desconsider\w*|descumpr\w*) (todas |todos )?(as |os |suas |seus |essas |esses |tuas )?(instrucoes|regras|ordens|orientacoes|restricoes|limites|comandos|prompts?)/,
  /\b(system prompt|prompt do sistema|prompt de sistema|seu prompt|suas instrucoes|jailbreak|modo desenvolvedor|developer mode)\b/,
  /\b(a partir de agora|de agora em diante|agora) voce (e|eh|sera|vai ser|deve ser) /,
  /\b(finja|faca de conta|aja como|se passe por|responda como se fosse)\b/,
  /\b(revele|mostre|repita|me (diga|conte)) (as |suas |seu |o )?(instrucoes|regras|prompt|configuracao)/,
];
const IDENTIDADE = [/\b(voce|vc|tu) (e|eh|era) (uma? )?(pessoa|gente|humano|humana|robo|bot|ia|maquina|real)\b/, /\b(e|eh) (uma? )?(pessoa|humano|humana|robo|bot) (de verdade|mesmo|real)\b/];
const PREVISAO = ['previsao de preco', 'previsao da safra', 'previsao de colheita', 'previsao da colheita', 'previsao', 'vai subir', 'vai cair', 'vai valer', 'quanto vai custar a saca', 'preco no mes que vem', 'preco mes que vem'];
const CLIMA = ['clima', 'chuva', 'chuvas', 'chover', 'chove', 'chovendo', 'temperatura', 'previsao do tempo', 'como esta o tempo', 'como ta o tempo', 'tempo em', 'tempo hoje', 'tempo amanha', 'o tempo'];
const DOLAR = ['dolar', 'cotacao do dolar', 'usd'];
const PRECO_PALAVRAS = ['preco', 'precos', 'cotacao', 'cotacoes', 'valor', 'quanto esta', 'quanto ta', 'quanto custa', 'quanto vale', 'quanto paga', 'quanto pagam', 'a quanto esta'];
// produto -> chave de bot/cotacoes-demo.js
const PRODUTOS_DEMO = [['soja', 'soja'], ['milho', 'milho'], ['trigo', 'trigo'], ['boi gordo', 'boi'], ['boi', 'boi'], ['arroba', 'boi']];
const PRECOS_GERAL = ['precos', 'cotacoes', 'precos e clima', 'cotacao'];

// Produto de uma pergunta de preço ("preço da soja", "quanto está o milho"); sem número e sem "e se"
function produtoDoTexto(t) {
  if (/\d/.test(t) || tem(t, ['e se'])) return null;
  if (!tem(t, PRECO_PALAVRAS)) return null;
  const achado = PRODUTOS_DEMO.find(([p]) => tem(t, [p]));
  return achado ? achado[1] : null;
}

// Cidade de "como está o tempo em Mandaguari?", "vai chover em Maringá amanhã", "clima de Londrina"; null se não vier
function cidadeDoTexto(texto) {
  const t = normalizarTexto(texto).replace(/[,.]/g, ' ').replace(/\s+/g, ' ');
  const m = t.match(/(?:clima|tempo|chuvas?|chover|chove|chovendo|temperatura)(?: [a-z]+){0,3}? (?:em|de|para|pra|na|no|da|do) ([a-z ]{2,40})$/);
  if (!m) return null;
  const limpo = m[1].replace(/ (hoje|amanha|agora|essa semana|esta semana|nos proximos dias)$/, '').replace(/^(cidade|municipio) (de |do |da )?/, '').trim();
  if (!limpo || ['hoje', 'amanha', 'agora', 'semana', 'tempo', 'clima'].includes(limpo) || limpo.split(' ').length > 6) return null;
  return limpo;
}
const PAINEL = ['painel', 'grafico', 'ver minha safra'];
const AUDIO = ['manda em audio', 'manda audio', 'responde em audio', 'responder em audio', 'quero audio', 'so texto', 'so por texto', 'sem audio', 'para de mandar audio'];
const SAFRA = ['safra', 'fazer (a |minha )?conta', 'minha conta', 'conta da', 'custo', 'saca', 'sacas', 'colher', 'colheita', 'hectare', 'hectares', 'alqueire', 'alqueires', 'prejuizo', 'lucro', 'e se'];

const CONFIRMA_FORTES = ['sim', 's', 'isso', 'certo', 'correto', 'ok', 'confirmo', 'exato', 'exatamente', 'positivo', 'claro', 'pode', 'certinho', 'perfeito', 'beleza', 'blz', 'combinado', 'fechado', 'aham', 'uhum', 'afirmativo', 'yes'];
const CONFIRMA_FRACAS = ['mesmo', 'ser', 'esta', 'ta', 'ai', 'tudo', 'e', 'sim', 'faz', 'fazer', 'a', 'conta', 'calcula', 'calcular', 'vai', 'manda', 'segue', 'seguir', 'por', 'favor', 'obrigado', 'obrigada', 'ne', 'ta bom', 'bom'];
const NEGA = ['nao', 'n', 'errado', 'negativo', 'nao esta certo', 'ta errado', 'esta errado', 'corrige', 'corrigir', 'quero corrigir', 'errada'];

// Letras repetidas ("siiim", "simmm") voltam a uma só; vale para confirmações curtas, em texto ou transcrição de áudio
const semAlongar = (t) => t.replace(/(\p{L})\1{2,}/gu, '$1');

function ehConfirmacao(texto) {
  const t = semAlongar(normalizarTexto(texto));
  const palavras = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!palavras.length || palavras.length > 6) return false;
  return palavras.some((p) => CONFIRMA_FORTES.includes(p)) && palavras.every((p) => CONFIRMA_FORTES.includes(p) || CONFIRMA_FRACAS.includes(p));
}

function ehNegacao(texto) {
  return NEGA.includes(semAlongar(normalizarTexto(texto)));
}

// "sim, está certo": confirmação explícita (usada quando a IAra avisou que um valor está fora do comum)
function ehConfirmacaoExplicita(texto) {
  if (!ehConfirmacaoDados(texto)) return false;
  return semAlongar(normalizarTexto(texto)).split(/[^\p{L}\p{N}]+/u).some((p) => ['certo', 'certinho', 'correto', 'confirmo', 'exato', 'exatamente', 'mesmo'].includes(p));
}

// Confirmação dos dados da safra (texto ou transcrição de áudio): aceita também "dá certinho, dá certinho. Vai.",
// "pode ir", "manda", "tá bom" e as transcrições prováveis de um "sim" curto ("fim", "sin", "si").
// Só vale na confirmação; "não", "errado" e "corrige" recusam.
const DADOS_FORTES = ['certinho', 'vai', 'manda', 'bom', 'fim', 'sin', 'si', 'correto', 'exato', 'confirmo'];
const DADOS_FRACAS = ['da', 'ir', 'fazer', 'faz', 'pode', 'ta', 'e', 'ai', 'ne'];
const DADOS_RECUSA = ['nao', 'n', 'errado', 'errada', 'erro', 'corrige', 'corrigir', 'negativo', 'quase', 'mudar', 'troca'];
function ehConfirmacaoDados(texto) {
  if (ehConfirmacao(texto)) return true;
  const palavras = semAlongar(normalizarTexto(texto)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!palavras.length || palavras.length > 8 || palavras.some((p) => DADOS_RECUSA.includes(p))) return false;
  const ok = (p) => DADOS_FORTES.includes(p) || DADOS_FRACAS.includes(p) || CONFIRMA_FORTES.includes(p) || CONFIRMA_FRACAS.includes(p);
  return palavras.every(ok) && palavras.some((p) => DADOS_FORTES.includes(p) || CONFIRMA_FORTES.includes(p));
}

// Saudação curta ("oi", "opa, e aí?", "bom dia, tudo bem"): no meio de um fluxo a IAra pergunta se continua ou vai ao menu
const SAUDACAO = /^(oi+|ola|opa|eae|oie|hey|salve|e ai|bom dia|boa tarde|boa noite)( (tudo bem|tudo bom|tudo|e ai|td bem|pessoal|pessoal tudo bem))*$/;
const CONTINUAR = ['continuar', 'continua', 'continuar a conta', 'quero continuar', 'seguir', 'pode continuar', 'vamos continuar', 'continuo', 'continuar conta', 'continuar a coleta'];
const ehSaudacao = (t) => SAUDACAO.test(semAlongar(t));

// Papo de cortesia ("tudo bem?", "você está bem?", "como vai?"), também como sai da transcrição de áudio
const PAPO = /^(e )?(ola |oi |opa )?(tudo (bem|bom|certo|joia|tranquilo)|(voce )?(ta|esta|anda) (tudo )?(bem|bom|certo)|como (voce )?(vai|esta|ta|anda)|(voce )?(ta|esta) bem|beleza)( (com voce|ai|por ai|ai com voce|mesmo|ne|e voce))*$/;
const ehPapo = (t) => PAPO.test(semAlongar(normalizarTexto(t)));

const MULTIPLICADORES = { mil: 1e3, k: 1e3, milhao: 1e6, milhoes: 1e6 };

function valorDoToken(numero, multiplicador) {
  let n;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(numero)) n = Number(numero.replace(/\./g, '').replace(',', '.')); // 45.000 ou 45.000,50
  else n = Number(numero.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return multiplicador ? n * MULTIPLICADORES[multiplicador] : n;
}

// Todos os números em dígitos do texto ("45 mil" = 45000; ignora "60 kg"), na ordem em que aparecem
function contarNumeros(texto) {
  const t = normalizarTexto(texto);
  const achados = [];
  const re = /(\d+(?:[.,]\d+)*)(?: ?(mil|milhao|milhoes|k)(?= |$))?( ?kg)?/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    if (m[3]) continue;
    const v = valorDoToken(m[1], m[2]);
    if (v != null) achados.push(v);
  }
  return achados;
}

// Se a mensagem inteira é só um número ("2", "45 mil", "uns 90 mil", "R$ 100"), devolve o valor; senão null.
// Número solto não diz a que campo pertence: quem decide é a pergunta que a IAra acabou de fazer.
function numeroSolto(texto) {
  const t = normalizarTexto(texto)
    .replace(/r\$/g, ' ')
    .replace(/(^| )(uns|umas|cerca|de|mais|ou|menos|aproximadamente|reais|real)(?= |$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?(?: (mil|milhao|milhoes|k))?$/);
  if (!m) return null;
  return valorDoToken((m[1] || '') + (m[2] || ''), m[3]);
}

// Retorna { intencao, eSe }
// intencao: menu | apagar | humano | injecao | perfil | tributario | agronomo | gatilho | alertas | clima | dolar | cotacao_demo | precos_clima | painel | audio | resumo | safra | fluxo | ambiguo
function rotear(texto, estado) {
  const t = normalizarTexto(texto);
  const emFluxo = ESTADOS_DE_FLUXO.includes(estado);
  if (emFluxo && ehSaudacao(t)) return { intencao: 'saudacao_fluxo' };
  if (MENU.includes(t) || ehSaudacao(t) || (!emFluxo && ehPapo(t))) return { intencao: 'menu' };
  if (APAGAR.some((p) => t.includes(p))) return { intencao: 'apagar' };
  if (IDENTIDADE.some((re) => re.test(t))) return { intencao: 'identidade' };
  if (t === '3' || (t !== 'pessoa' ? tem(t, HUMANO.filter((h) => h !== 'pessoa')) : true)) return { intencao: 'humano' };
  if (INJECAO.some((re) => re.test(t))) return { intencao: 'injecao' };
  // Comandos de áudio valem em qualquer estado, inclusive dentro de um fluxo
  if (tem(t, AUDIO) && !/\d/.test(t)) return { intencao: 'audio' };
  // Dentro de um fluxo ativo, tudo é resposta do fluxo (exceto menu, 3 e apagar)
  if (emFluxo && CONTINUAR.includes(semAlongar(t))) return { intencao: 'continuar' };
  if (emFluxo) return { intencao: 'fluxo', eSe: tem(t, ['e se']) };
  // "1" seguido de outras linhas (mensagens agrupadas pelo debounce): escolhe a safra e o resto segue como resposta a ela
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length > 1 && normalizarTexto(linhas[0]) === '1') return { intencao: 'safra', eSe: false, soPedido: false, resto: linhas.slice(1).join('\n') };
  if (linhas.length > 1 && normalizarTexto(linhas[0]) === '2') return { intencao: 'perfil', resto: linhas.slice(1).join('\n') };
  if (tem(t, LISTA_ALERTAS)) return { intencao: 'alertas' };
  if (t === '4' || tem(t, GATILHO)) return { intencao: 'gatilho' };
  if (t === '2') return { intencao: 'perfil' };
  if (tem(t, TRIBUTARIO)) return { intencao: 'tributario' };
  if (tem(t, AGRO_TECNICO)) return { intencao: 'agronomo' };
  if (tem(t, CLIMA)) return { intencao: 'clima' };
  if (tem(t, PREVISAO)) return { intencao: 'previsao' };
  if (tem(t, DOLAR)) return { intencao: 'dolar' };
  const produto = produtoDoTexto(t);
  if (produto) return { intencao: 'cotacao_demo', produto };
  if (t === '5' || tem(t, PRECOS_GERAL)) return { intencao: 'precos_clima' };
  if (tem(t, PAINEL)) return { intencao: 'painel' };
  if (tem(t, AUDIO)) return { intencao: 'audio' };
  if (t === 'resumo') return { intencao: 'resumo' };
  const eSe = tem(t, ['e se']);
  if (t === '1' || tem(t, SAFRA)) return { intencao: 'safra', eSe, soPedido: t === '1' || !/\d/.test(t) };
  return { intencao: 'ambiguo' };
}

function pedeApagar(texto) {
  const t = normalizarTexto(texto);
  return APAGAR.some((p) => t.includes(p));
}

module.exports = { ehPapo, cidadeDoTexto, produtoDoTexto, ehConfirmacaoDados, ehSaudacao, pedeApagar, rotear, normalizarTexto, ehConfirmacao, ehConfirmacaoExplicita, ehNegacao, numeroSolto, contarNumeros };

// Dúvidas gerais do agro (doença, praga, manejo, plantio, colheita, solo). O LLM redige com prompts/agro_geral.md;
// o bot confere a saída antes de enviar: nada de produto comercial, princípio ativo, dose, calda ou "aplique".
// Pedido explícito de produto ou dose nem chega ao LLM.

const fs = require('node:fs');
const path = require('node:path');
const T = require('./textos');
const { chatTexto } = require('./llm');

const ARQUIVO = path.join(__dirname, '..', 'prompts', 'agro_geral.md');

let cache = null;
function carregarPrompt(arquivo = ARQUIVO) {
  const md = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');
  const versao = (md.match(/\(v(\d+(?:\.\d+)?)\)/) || [, '?'])[1];
  const system = md.split('## Mensagem de sistema')[1].split('## Testes mínimos')[0].trim();
  return { system, versao: 'agro_geral_v' + versao };
}

function semAcento(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Pedido de produto, veneno, dose ou "quanto passar": resposta fixa, sem LLM
const PEDE_PRODUTO = /(^|\s)(veneno|venenos|dose|doses|calda|receita de|(qual|que|quais) (produto|produtos|remedio|remedios|veneno|fungicida|inseticida|herbicida|defensivo)|nome do (produto|veneno|remedio)|(o que|oque|qual|quanto|quantos?|quantas?) (eu )?(passo|passar|aplico|aplicar|pulverizo|pulverizar|coloco|colocar|uso|usar|misturo|misturar|jogo|jogar)|quanto (de )?(veneno|produto|fungicida|inseticida|herbicida))(\s|$)/;
const pedeProduto = (pergunta) => PEDE_PRODUTO.test(semAcento(pergunta));

// Dose ou unidade de aplicação na saída
const UNIDADE_APLICACAO = /\b(?:l|ml|g|kg|cc)\s*\/\s*(?:ha|hectare|100\s*l)\b|\b\d+(?:[.,]\d+)?\s*(?:litros?|ml|gramas?|g|kg|quilos?)\s*(?:por|p\/)\s*(?:ha|hectare|100\s*litros)\b/;
const KG_HA = /\bkg\s*\/\s*ha\b|\b\d+(?:[.,]\d+)?\s*kg\s*(?:por|p\/)\s*(?:ha|hectare)\b/;
const CONTEXTO_DEFENSIVO = /(fungicida|inseticida|herbicida|defensivo|agrotoxico|veneno|produto quimico)/;
const ORDEM_DE_APLICACAO = /\b(aplique|aplicar com|pulverize|pulverizar com|misture|dilua|calda)\b/;
// Princípios ativos e marcas comuns (lista de segurança; o prompt já proíbe)
const NOMES_PROIBIDOS = new RegExp('\\b(' + [
  'glifosato', 'glyphosate', 'azoxistrobina', 'tebuconazol', 'trifloxistrobina', 'epoxiconazol', 'protioconazol', 'piraclostrobina',
  'mancozebe', 'clorotalonil', 'clorpirifos', 'cialotrina', 'imidacloprido', 'tiametoxam', 'fipronil', 'bifentrina', 'metomil', 'acefato',
  'atrazina', 'paraquate', 'diquate', 'glufosinato', 'carbendazim', 'flutriafol', 'ciproconazol', 'emamectina', 'espinosad',
  'clorantraniliprole', 'flubendiamida', 'tiodicarbe', 'lufenuron', 'teflubenzuron', 'metoxifenozida', 'abamectina', 'fluxapiroxade',
  'mefentrifluconazol', 'picoxistrobina', 'benzovindiflupir', 'imidacloprid',
  'roundup', 'priori', 'elatus', 'orkestra', 'ativum', 'aproach', 'cypress', 'engeo', 'karate', 'decis', 'lannate', 'certero', 'ampligo',
  'folicur', 'gramoxone', 'fox xpro', 'aviator', 'vessarya', 'sphere max', 'galil', 'talstar', 'nomolt', 'intrepid', 'avatar',
].join('|') + ')\\b');

function temDoseOuProduto(saida) {
  const s = semAcento(saida);
  if (UNIDADE_APLICACAO.test(s) || ORDEM_DE_APLICACAO.test(s) || NOMES_PROIBIDOS.test(s)) return true;
  return KG_HA.test(s) && CONTEXTO_DEFENSIVO.test(s);
}

// Converte a saída do LLM em { tipo, texto }: tipo = resposta | sem_receita | nao_sei | fora_escopo
function interpretar(saida) {
  const s = String(saida || '').trim();
  if (!s) return { tipo: 'nao_sei', texto: T.AGRO_NAO_SEI };
  if (/FORA_ESCOPO/.test(s)) return { tipo: 'fora_escopo', texto: T.FORA_ESCOPO };
  if (/SEM_RECEITA/.test(s) || temDoseOuProduto(s)) return { tipo: 'sem_receita', texto: T.AGRO_SEM_RECEITA };
  if (/NAO_SEI/.test(s)) return { tipo: 'nao_sei', texto: T.AGRO_NAO_SEI };
  const texto = s.includes(T.AGRO_FECHAMENTO) ? s : s + '\n' + T.AGRO_FECHAMENTO;
  return { tipo: 'resposta', texto };
}

// chat: injetável nos testes
async function responder(pergunta, chat = chatTexto) {
  if (!cache) cache = carregarPrompt();
  if (pedeProduto(pergunta)) return { tipo: 'sem_receita', texto: T.AGRO_SEM_RECEITA, versao: cache.versao, semLlm: true };
  const saida = await chat({ system: cache.system, user: String(pergunta).slice(0, 800), temperatura: 0.2 });
  return { ...interpretar(saida), versao: cache.versao };
}

module.exports = { responder, interpretar, pedeProduto, temDoseOuProduto, carregarPrompt };

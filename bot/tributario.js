// Redator tributário: dúvida livre sobre a reforma, só com content/reforma_tributaria_base.md.
// O LLM redige; o bot confere a saída (tokens, recomendação, valores em reais, frase padrão) antes de enviar.

const fs = require('node:fs');
const path = require('node:path');
const T = require('./textos');
const { chatTexto } = require('./llm');
const { contarNumeros } = require('./roteador');

const RAIZ = path.join(__dirname, '..');
const LIMITE_RECEITA = 3600000;

function carregarPrompt(arquivo = path.join(RAIZ, 'prompts', 'agente_sistema.md')) {
  const md = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');
  const versao = (md.match(/\(v(\d+(?:\.\d+)?)\)/) || [, '?'])[1];
  const regras = md.split('## Mensagem de sistema')[1].split('## Testes mínimos')[0]
    .split('\n').filter((l) => !l.startsWith('Os tokens NAO_SEI')).join('\n').trim();
  return { regras, versao: 'tributario_v' + versao };
}

let cache = null;
function montarSistema(perfil) {
  if (!cache) {
    const { regras, versao } = carregarPrompt();
    const base = fs.readFileSync(path.join(RAIZ, 'content', 'reforma_tributaria_base.md'), 'utf8').replace(/\r\n/g, '\n');
    cache = { regras, versao, base };
  }
  const perfilJson = JSON.stringify(perfil || {});
  return {
    versao: cache.versao,
    system: cache.regras + '\n\n<base>\n' + cache.base + '\n</base>\n\nPerfil já coletado: ' + perfilJson,
  };
}

// Recomendações de regime ou de venda que o prompt proíbe: se aparecerem, a resposta é descartada
const RECOMENDA = /\b(opte|fique (?:como|com|no|na)|recomendo|aconselho|sugiro|voce deve (?:optar|vender|segurar|ficar)|venda agora|segure a (?:soja|safra|producao))\b/;

function semAcento(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Valores em reais da resposta que não vêm da base (limite de R$ 3,6 milhões) nem da conversa
function reaisInventados(saida, permitidos) {
  const re = /R\$\s*(\d+(?:[.,]\d+)*)(?:\s*(milh[aã]o|milh[õo]es|mil))?/gi;
  let m;
  while ((m = re.exec(saida)) !== null) {
    const valor = contarNumeros(m[1] + (m[2] ? ' ' + semAcento(m[2]) : ''))[0];
    if (valor == null) continue;
    if (!permitidos.some((p) => Math.abs(p - valor) < 1e-6)) return true;
  }
  return false;
}

// Converte a saída do LLM em { tipo, texto }: tipo = resposta | nao_sei | fora_escopo
function interpretar(saida, { pergunta = '', perfil = null } = {}) {
  const s = String(saida || '').trim();
  if (!s) return { tipo: 'nao_sei', texto: T.NAO_SEI_TRIBUTARIO };
  if (/FORA_ESCOPO/.test(s)) return { tipo: 'fora_escopo', texto: T.FORA_ESCOPO };
  if (/NAO_SEI/.test(s)) return { tipo: 'nao_sei', texto: T.NAO_SEI_TRIBUTARIO };
  if (RECOMENDA.test(semAcento(s))) return { tipo: 'nao_sei', texto: T.NAO_SEI_TRIBUTARIO };
  const permitidos = [LIMITE_RECEITA, 3.6, ...contarNumeros(pergunta)];
  if (perfil && perfil.receita != null) permitidos.push(perfil.receita);
  if (reaisInventados(s, permitidos)) return { tipo: 'nao_sei', texto: T.NAO_SEI_TRIBUTARIO };
  const texto = s.includes(T.FRASE_PADRAO_TRIBUTARIA) ? s : s + '\n' + T.FRASE_PADRAO_TRIBUTARIA;
  return { tipo: 'resposta', texto };
}

// chat: injetável nos testes
async function responder(pergunta, perfil, chat = chatTexto) {
  const { system, versao } = montarSistema(perfil);
  const saida = await chat({ system, user: String(pergunta).slice(0, 800), temperatura: 0.2 });
  return { ...interpretar(saida, { pergunta, perfil }), versao };
}

module.exports = { responder, interpretar, carregarPrompt };

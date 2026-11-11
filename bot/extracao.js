// Extração dos dados da safra com prompts/extracao_safra.md (fonte única do prompt e do schema).
// O LLM só extrai; a validação dos campos e das faixas é feita aqui e em src/calc/safra.cjs.

const fs = require('node:fs');
const path = require('node:path');
const { chatJson } = require('./llm');

const ARQUIVO = path.join(__dirname, '..', 'prompts', 'extracao_safra.md');

function carregarPrompt(arquivo = ARQUIVO) {
  const md = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');
  const versao = (md.match(/\(v(\d+\.\d+)\)/) || [, '?'])[1];
  const regras = md.split('## Mensagem de sistema')[1].split('## JSON Schema')[0].trim();
  const bloco = md.split('## JSON Schema')[1].match(/```json\n([\s\S]*?)\n```/)[1];
  const schema = JSON.parse(bloco).schema; // o envelope name/strict não é enviado
  const system = regras + '\n\nSchema JSON (todos os campos obrigatórios; use null quando não informado):\n' + JSON.stringify(schema);
  return { system, versao: 'extracao_v' + versao };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
const enumOuNull = (v, lista) => (lista.includes(v) ? v : null);

// Garante o formato da extração, seja qual for o provedor
function sanitizarExtracao(bruto) {
  const e = bruto && typeof bruto === 'object' ? bruto : {};
  let alt = null;
  if (e.alteracao && typeof e.alteracao === 'object') {
    alt = {
      produtividade_pct: num(e.alteracao.produtividade_pct),
      preco: num(e.alteracao.preco),
      custo_total: num(e.alteracao.custo_total),
      produtividade_valor: num(e.alteracao.produtividade_valor),
    };
    if (Object.values(alt).every((v) => v == null)) alt = null;
  }
  const cultura = typeof e.cultura === 'string' ? e.cultura.trim().slice(0, 40) : '';
  return {
    cultura: cultura || null,
    area_valor: num(e.area_valor),
    area_unidade: enumOuNull(e.area_unidade, ['ha', 'alqueire']),
    custo_total: num(e.custo_total),
    produtividade_valor: num(e.produtividade_valor),
    produtividade_unidade: enumOuNull(e.produtividade_unidade, ['sc/ha', 'sc/alqueire']),
    preco: num(e.preco),
    gatilho_preco: num(e.gatilho_preco),
    confirmacao: e.confirmacao === true,
    fora_do_tema: e.fora_do_tema === true,
    alteracao: alt,
  };
}

function temDadosDeSafra(ext) {
  return ['cultura', 'area_valor', 'custo_total', 'produtividade_valor', 'preco'].some((c) => ext[c] != null);
}

let promptCache = null;

// ctx: { dados_atuais, campo_pedido }
async function extrair(texto, ctx = {}) {
  promptCache = promptCache || carregarPrompt();
  const usuario = JSON.stringify({
    mensagem: String(texto).slice(0, 800),
    dados_atuais: ctx.dados_atuais || {},
    campo_pedido: ctx.campo_pedido || null,
  });
  const bruto = await chatJson({ system: promptCache.system, user: usuario });
  return { ext: sanitizarExtracao(bruto), versao: promptCache.versao };
}

module.exports = { extrair, carregarPrompt, sanitizarExtracao, temDadosDeSafra };

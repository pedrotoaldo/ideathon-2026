// Máquina de estados da conversa (docs/ARCHITECTURE.md seção 4). Sem I/O: recebe o LLM por injeção (deps.extrair),
// devolve { estado, dados, respostas } e quem grava no banco e envia é o processar.js. Todo número sai de safra.cjs.

const S = require('../src/calc/safra.cjs');
const T = require('./textos');
const { rotear, ehConfirmacao, ehNegacao, normalizarTexto } = require('./roteador');
const { temDadosDeSafra } = require('./extracao');

const ORDEM = ['area_ha', 'custo_total', 'produtividade', 'preco'];
const FLUXO = ['coletando_safra', 'confirmando_safra'];

function clonar(o) {
  return JSON.parse(JSON.stringify(o || {}));
}

async function tratar(conversa, texto, deps) {
  const out = { estado: conversa.estado, dados: clonar(conversa.dados), respostas: [], versao_prompt: null };
  const dados = out.dados;
  const say = (t, intencao, usou_llm = false) => out.respostas.push({ texto: t, intencao, usou_llm });

  async function chamarLlm(t, campo_pedido) {
    const { ext, versao } = await deps.extrair(t, { dados_atuais: dados.safra || {}, campo_pedido });
    out.versao_prompt = versao;
    return ext;
  }

  function perguntar(campo, prefixo = '') {
    dados.coleta = { ...(dados.coleta || {}), campo_pedido: campo };
    say((prefixo ? prefixo + '\n' : '') + T.PERGUNTA_CAMPO[campo], 'safra', false);
  }

  function iniciarSafra() {
    dados.safra = {};
    dados.coleta = {};
    out.estado = 'coletando_safra';
  }

  // Mescla a extração em dados.safra e decide a próxima fala. Retorna true se algo mudou.
  function aplicar(ext, { jaConfirmando = false } = {}) {
    const antes = JSON.stringify(dados.safra || {});
    const coleta = (dados.coleta = dados.coleta || {});
    const trabalho = { ...ext };

    // O LLM às vezes repete um campo já coletado (ex.: 48,4 ha em vez dos 20 alqueires ditos): se o valor não mudou, ignora
    const atual = dados.safra || {};
    if (trabalho.area_valor != null && atual.area_ha != null && S.converterAreaParaHa(trabalho.area_valor, trabalho.area_unidade) === atual.area_ha) trabalho.area_valor = null;

    // Área sem unidade: pergunta antes de converter (alqueire = 2,42 ha)
    if (trabalho.area_valor != null && !trabalho.area_unidade) {
      coleta.pendente_area = trabalho.area_valor;
      trabalho.area_valor = null;
    }
    let novo = S.mesclarExtracao(dados.safra || {}, trabalho);

    const fora = S.camposForaDaFaixa(novo);
    for (const c of fora) {
      novo[c] = null;
      if (c === 'area_ha') novo.area_origem = null;
    }
    dados.safra = novo;
    const mudou = JSON.stringify(novo) !== antes || fora.length > 0 || coleta.pendente_area != null;

    if (fora.length) {
      perguntar(fora[0], T.FORA_DA_FAIXA);
      out.estado = 'coletando_safra';
    } else if (coleta.pendente_area != null) {
      dados.coleta.campo_pedido = 'area_ha';
      say(T.PERGUNTA_UNIDADE_AREA.replace('{valor}', S.formatarDecimal(coleta.pendente_area)), 'safra');
      out.estado = 'coletando_safra';
    } else {
      const faltam = S.camposFaltantes(novo);
      if (faltam.length) {
        perguntar(faltam[0]);
        out.estado = 'coletando_safra';
      } else if (mudou || !jaConfirmando) {
        delete dados.coleta;
        say(S.montarConfirmacao(novo), 'safra');
        out.estado = 'confirmando_safra';
      }
    }
    return mudou;
  }

  // Resolve a unidade da área sem LLM ("hectares" ou "alqueires")
  function resolverUnidadeArea(t) {
    const n = normalizarTexto(t);
    const unidade = /\balqueire/.test(n) ? 'alqueire' : /\b(ha|hectare|hectares)\b/.test(n) ? 'ha' : null;
    if (!unidade) {
      say(T.PERGUNTA_UNIDADE_AREA.replace('{valor}', S.formatarDecimal(dados.coleta.pendente_area)), 'safra');
      return;
    }
    const valor = dados.coleta.pendente_area;
    delete dados.coleta.pendente_area;
    aplicar({ ...semDados(), area_valor: valor, area_unidade: unidade });
  }

  function semDados() {
    return {
      cultura: null, area_valor: null, area_unidade: null, custo_total: null, produtividade_valor: null,
      produtividade_unidade: null, preco: null, gatilho_preco: null, confirmacao: false, fora_do_tema: false, alteracao: null,
    };
  }

  async function coletar(t) {
    if (dados.coleta && dados.coleta.pendente_area != null) return resolverUnidadeArea(t);
    const ext = await chamarLlm(t, dados.coleta && dados.coleta.campo_pedido);
    const mudou = aplicar(ext);
    if (!mudou) {
      // Nada aproveitável: repete a pergunta pendente (ou diz que está fora do escopo)
      out.respostas = [];
      const campo = S.camposFaltantes(dados.safra || {})[0] || ORDEM[0];
      perguntar(campo, ext.fora_do_tema ? T.FORA_ESCOPO : '');
    }
  }

  async function confirmar(t) {
    if (ehConfirmacao(t)) {
      const calc = S.calcularSafra(dados.safra, S.CENARIOS_PADRAO);
      dados.ultimo_calculo = {
        cultura: dados.safra.cultura || null,
        entrada: calc.entrada,
        custo_ha: calc.custo_ha,
        produtividade_minima: calc.produtividade_minima,
        preco_equilibrio: calc.preco_equilibrio,
        calculado_em: new Date().toISOString(),
      };
      say(S.montarRespostaSafra(calc), 'safra');
      say(T.OFERTA_PROXIMO, 'safra');
      out.estado = 'resultado_safra';
      return;
    }
    if (ehNegacao(t)) { say(T.PERGUNTA_CORRECAO, 'safra'); return; }
    if (dados.coleta && dados.coleta.pendente_area != null) return resolverUnidadeArea(t);
    const ext = await chamarLlm(t, null);
    const mudou = aplicar(ext, { jaConfirmando: true });
    if (!mudou) { out.respostas = []; say(T.PERGUNTA_CORRECAO, 'safra'); }
  }

  async function eSe(t) {
    if (!dados.safra || S.camposFaltantes(dados.safra).length) { say(T.SEM_CONTA, 'safra'); return; }
    const ext = await chamarLlm(t, null);
    let alt = ext.alteracao;
    if (!alt) {
      const a = { produtividade_pct: null, preco: ext.preco, custo_total: ext.custo_total, produtividade_valor: ext.produtividade_valor };
      alt = Object.values(a).some((v) => v != null) ? a : null;
    }
    if (!alt) { say(T.ESE_NAO_ENTENDI, 'safra', true); return; }
    const r = S.calcularESe(dados.safra, alt);
    const invalido = S.camposForaDaFaixa(r.dados).length > 0 || (alt.produtividade_pct != null && (alt.produtividade_pct <= -100 || alt.produtividade_pct > 500));
    if (invalido) { say(T.FORA_DA_FAIXA, 'safra', true); return; }
    say(S.montarRespostaESe(r), 'safra', true);
  }

  // Sem regra que resolva: o LLM decide se é safra ou fora do escopo
  async function ambiguo(t) {
    const ext = await chamarLlm(t, null);
    if (temDadosDeSafra(ext) && !ext.fora_do_tema) {
      iniciarSafra();
      aplicar(ext);
      return;
    }
    if (ext.gatilho_preco != null) { say(T.EM_BREVE, 'gatilho'); return; }
    if (ext.alteracao) { say(T.SEM_CONTA, 'safra', true); return; }
    say(T.FORA_ESCOPO, 'fora_escopo', true);
  }

  const r = rotear(texto, conversa.estado);

  if (r.intencao === 'menu') {
    out.estado = 'menu';
    delete dados.coleta;
    say(T.MENU, 'menu');
  } else if (['apagar', 'humano', 'tributario', 'gatilho', 'clima', 'painel', 'audio', 'resumo'].includes(r.intencao)) {
    say(T.EM_BREVE, r.intencao); // entram nas Etapas 3 e 4 e nas Fases Plus
  } else if (r.intencao === 'fluxo') {
    if (conversa.estado === 'coletando_safra') await coletar(texto);
    else await confirmar(texto);
  } else if (r.intencao === 'safra') {
    if (r.eSe) {
      await eSe(texto); // sem conta pronta, o próprio eSe responde SEM_CONTA
    } else if (r.soPedido) {
      iniciarSafra();
      say(T.PEDE_SAFRA, 'safra');
    } else {
      iniciarSafra();
      await coletar(texto); // a mensagem já traz dados: extrai na hora
    }
  } else {
    await ambiguo(texto);
  }

  return out;
}

module.exports = { tratar, FLUXO };

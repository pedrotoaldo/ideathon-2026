// Máquina de estados da conversa (docs/ARCHITECTURE.md seção 4). Sem I/O: recebe o LLM por injeção (deps.extrair),
// devolve { estado, dados, respostas, acao } e quem grava no banco e envia é o processar.js. Todo número sai de safra.cjs.

const S = require('../src/calc/safra.cjs');
const T = require('./textos');
const { rotear, ehConfirmacao, ehConfirmacaoExplicita, ehNegacao, normalizarTexto, numeroSolto, contarNumeros } = require('./roteador');
const { temDadosDeSafra } = require('./extracao');

const ORDEM = ['area_ha', 'custo_total', 'produtividade', 'preco'];
const FLUXO = ['coletando_safra', 'confirmando_safra', 'perfil_tributario'];
const DESCRICAO = { area_ha: 'a área', custo_total: 'o custo total', produtividade: 'as sacas por hectare', preco: 'o preço da saca' };

function clonar(o) {
  return JSON.parse(JSON.stringify(o || {}));
}

function semDados() {
  return {
    cultura: null, area_valor: null, area_unidade: null, custo_total: null, produtividade_valor: null,
    produtividade_unidade: null, preco: null, gatilho_preco: null, confirmacao: false, fora_do_tema: false,
    numeros_ambiguos: false, alteracao: null,
  };
}

// Extração equivalente a "o produtor respondeu só este número à pergunta deste campo"
function preencher(e, campo, valor) {
  if (campo === 'area_ha') e.area_valor = valor; // sem unidade: a IAra pergunta hectare ou alqueire
  else if (campo === 'custo_total') e.custo_total = valor;
  else if (campo === 'produtividade') { e.produtividade_valor = valor; e.produtividade_unidade = 'sc/ha'; }
  else if (campo === 'preco') e.preco = valor;
  return e;
}
const extDoCampo = (campo, valor) => preencher(semDados(), campo, valor);

const perto = (a, b) => Math.abs(a - b) < 1e-6;

// Todo número digitado aparece na extração? (se sobra algum, o LLM não soube a que campo ele pertence)
function todosExplicados(numeros, ext) {
  const alvo = [ext.area_valor, ext.custo_total, ext.produtividade_valor, ext.preco, ext.gatilho_preco].filter((v) => v != null);
  return numeros.every((n) => alvo.some((v) => perto(v, n)));
}

// ---------- Perfil tributário (perguntas por regra, sem LLM) ----------
const ETAPAS_PERFIL = ['tipo', 'receita', 'integrado', 'outra_empresa'];
const PERGUNTA_PERFIL = {
  tipo: T.PERGUNTA_TIPO_PESSOA,
  receita: T.PERGUNTA_RECEITA,
  integrado: T.PERGUNTA_INTEGRADO,
  outra_empresa: T.PERGUNTA_OUTRA_EMPRESA,
};

function lerTipoPessoa(t) {
  const n = normalizarTexto(t);
  const pf = /(^| )(pessoa fisica|fisica|pf|cpf|autonomo|individual|sozinho)( |$)/.test(n);
  const pj = /(^| )(pessoa juridica|juridica|empresa|cnpj|pj|ltda|mei|sociedade)( |$)/.test(n);
  if (pf === pj) return null;
  return pf ? 'pessoa_fisica' : 'empresa';
}

function lerSimNao(t) {
  const n = normalizarTexto(t);
  if (!n) return null;
  if (ehNegacao(t) || /^(nao|n|nunca|nenhuma|nenhum)( |$)/.test(n)) return false;
  if (ehConfirmacao(t) || /^(sou|tenho|participo|produzo|possuo)( |$)/.test(n)) return true;
  return null;
}

// Receita anual aproximada: um valor em reais ("uns 900 mil por ano", "3,6 milhões")
function lerReceita(t) {
  const nums = contarNumeros(t);
  if (nums.length !== 1) return { erro: nums.length ? 'varios' : 'nenhum' };
  if (nums[0] < 1000) return { erro: 'pequeno' };
  if (nums[0] > 1e11) return { erro: 'nenhum' };
  return { valor: nums[0] };
}

// ---------- Alerta de preço (Etapa 4) ----------
const CULTURAS = ['soja', 'milho', 'trigo', 'cafe', 'feijao', 'sorgo', 'arroz', 'algodao', 'cana', 'mandioca', 'aveia', 'cevada', 'girassol', 'amendoim'];
const NOME_CULTURA = { cafe: 'café', feijao: 'feijão', algodao: 'algodão' };
function lerCultura(t) {
  const n = normalizarTexto(t);
  return CULTURAS.find((c) => new RegExp('(^| )' + c + '( |$)').test(n)) || null;
}

const pareceDuvida = (t) => /[?]/.test(t) || normalizarTexto(t).split(' ').length >= 6;

async function tratar(conversa, texto, deps) {
  const out = { estado: conversa.estado, dados: clonar(conversa.dados), respostas: [], versao_prompt: null };
  const dados = out.dados;
  const faixasCultura = deps.faixasCultura || S.FAIXAS_CULTURA_PADRAO;
  const say = (t, intencao, usou_llm = false) => out.respostas.push({ texto: t, intencao, usou_llm });

  async function chamarLlm(t, campo_pedido) {
    const { ext, versao } = await deps.extrair(t, { dados_atuais: dados.safra || {}, campo_pedido });
    out.versao_prompt = versao;
    return { ...semDados(), ...ext };
  }

  function perguntar(campo, prefixo = '') {
    dados.coleta = { ...(dados.coleta || {}), campo_pedido: campo };
    say((prefixo ? prefixo + '\n' : '') + T.PERGUNTA_CAMPO[campo], 'safra', false);
  }

  function iniciarSafra() {
    dados.safra = {};
    dados.coleta = {}; // sem campo_pedido: número solto logo depois do PEDE_SAFRA não vai para campo nenhum
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
    const novo = S.mesclarExtracao(dados.safra || {}, trabalho);

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
        // Produtividade fora do comum para a cultura: destaca e exige correção ou "sim, está certo"
        const aviso = S.avisoFaixaCultura(novo, faixasCultura);
        dados.coleta = aviso ? { alerta_faixa: aviso } : {};
        say(S.montarConfirmacao(novo, aviso), 'safra');
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

  // Vários números para um campo só e sem rótulo claro: mostra a interpretação e pede o "sim"
  function perguntarHipotese(campo, numeros) {
    const campos = [campo, ...ORDEM.slice(ORDEM.indexOf(campo) + 1).filter((c) => S.camposFaltantes(dados.safra || {}).includes(c))];
    if (numeros.length > campos.length) {
      perguntar(campo, T.NUMEROS_AMBIGUOS);
      return;
    }
    const partes = numeros.map((n, i) => (i === 0 ? S.formatarDecimal(n) + ' são ' + DESCRICAO[campos[i]] : S.formatarDecimal(n) + ' ' + DESCRICAO[campos[i]]));
    const frase = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0];
    dados.coleta = { ...(dados.coleta || {}), campo_pedido: campo, hipotese: { campos: campos.slice(0, numeros.length), valores: numeros } };
    say(frase + '? ' + T.CONFIRMA_HIPOTESE, 'safra');
  }

  async function coletar(t) {
    const coleta = (dados.coleta = dados.coleta || {});
    if (coleta.pendente_area != null) return resolverUnidadeArea(t);

    // Hipótese pendente ("60 são as sacas por hectare e 100 o preço da saca?"): "sim" aplica todas
    if (coleta.hipotese) {
      const h = coleta.hipotese;
      delete coleta.hipotese;
      if (ehConfirmacao(t)) {
        const ext = semDados();
        h.campos.forEach((c, i) => preencher(ext, c, h.valores[i]));
        aplicar(ext);
        return;
      }
    }

    const campo = coleta.campo_pedido || null;

    // Número solto vai só para o campo que a IAra acabou de perguntar (sem LLM). Sem pergunta pendente, pergunta a que se refere.
    const solto = numeroSolto(t);
    if (solto != null) {
      if (!campo) { say(T.NUMERO_SOLTO, 'safra'); return; }
      aplicar(extDoCampo(campo, solto));
      return;
    }

    const ext = await chamarLlm(t, campo);
    const numeros = contarNumeros(t);
    if (numeros.length >= 2 && (ext.numeros_ambiguos || (campo && !todosExplicados(numeros, ext)))) {
      if (campo) perguntarHipotese(campo, numeros);
      else say(T.NUMEROS_AMBIGUOS_LIVRE, 'safra', true);
      return;
    }

    const mudou = aplicar(ext);
    if (!mudou) {
      // Nada aproveitável: repete a pergunta pendente (ou diz que está fora do escopo)
      out.respostas = [];
      const falta = S.camposFaltantes(dados.safra || {})[0] || ORDEM[0];
      perguntar(falta, ext.fora_do_tema ? T.FORA_ESCOPO : '');
    }
  }

  function calcular() {
    const calc = S.calcularSafra(dados.safra, S.CENARIOS_PADRAO);
    dados.ultimo_calculo = {
      cultura: dados.safra.cultura || null,
      entrada: calc.entrada,
      custo_ha: calc.custo_ha,
      produtividade_minima: calc.produtividade_minima,
      preco_equilibrio: calc.preco_equilibrio,
      calculado_em: new Date().toISOString(),
    };
    delete dados.coleta;
    say(S.montarRespostaSafra(calc), 'safra');
    out.respostas[out.respostas.length - 1].falado = S.montarResumoFalado(calc); // texto para a voz da IAra (Etapa 5)
    say(T.OFERTA_PROXIMO, 'safra');
    out.estado = 'resultado_safra';
  }

  async function confirmar(t, eSeNaConfirmacao) {
    if (eSeNaConfirmacao) { say(T.ESE_ANTES_CONFIRMAR, 'safra'); return; } // continua em confirmando_safra
    const alerta = dados.coleta && dados.coleta.alerta_faixa;
    if (ehConfirmacao(t)) {
      if (alerta && !ehConfirmacaoExplicita(t)) { say(S.montarConfirmacao(dados.safra, alerta), 'safra'); return; }
      calcular();
      return;
    }
    if (ehNegacao(t)) { say(T.PERGUNTA_CORRECAO, 'safra'); return; }
    if (dados.coleta && dados.coleta.pendente_area != null) return resolverUnidadeArea(t);
    if (numeroSolto(t) != null) { say(T.NUMERO_SOLTO, 'safra'); return; } // correção sem dizer qual campo
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
    if (conversa.estado === 'tributario') { await duvida(t); return; } // conversa sobre a reforma: segue com o redator
    const ext = await chamarLlm(t, null);
    if (ext.gatilho_preco != null && !ext.fora_do_tema) { await criarAlerta(t, ext); return; }
    if (temDadosDeSafra(ext) && !ext.fora_do_tema) {
      iniciarSafra();
      if (ext.numeros_ambiguos && contarNumeros(t).length >= 2) { say(T.NUMEROS_AMBIGUOS_LIVRE, 'safra', true); return; }
      aplicar(ext);
      return;
    }
    if (ext.alteracao) { say(T.SEM_CONTA, 'safra', true); return; }
    say(T.FORA_ESCOPO, 'fora_escopo', true);
  }

  // ----- Reforma tributária -----
  function iniciarPerfil() {
    dados.perfil = { etapa: 'tipo' };
    dados.nao_sei = null;
    out.estado = 'perfil_tributario';
    say(PERGUNTA_PERFIL.tipo, 'tributario');
  }

  async function duvida(t) {
    const perfil = dados.perfil ? { ...dados.perfil, etapa: undefined } : null;
    const x = await deps.tributario(t, perfil);
    out.versao_prompt = x.versao;
    say(x.texto, x.tipo === 'fora_escopo' ? 'fora_escopo' : 'tributario', true);
    if (x.tipo === 'nao_sei') dados.nao_sei = { pergunta: String(t).slice(0, 200) };
    else if (x.tipo === 'resposta') dados.nao_sei = null;
    if (x.tipo !== 'fora_escopo') out.estado = 'tributario';
    return x;
  }

  async function perfil(t) {
    const p = (dados.perfil = dados.perfil || { etapa: 'tipo' });
    const etapa = p.etapa;
    let ok = false;
    let dica = '';
    if (etapa === 'tipo') {
      const v = lerTipoPessoa(t);
      if (v) { p.tipo = v; ok = true; }
    } else if (etapa === 'receita') {
      const v = lerReceita(t);
      if (v.valor != null) { p.receita = v.valor; ok = true; } else dica = T.PERFIL_RECEITA_DICA;
    } else {
      const v = lerSimNao(t);
      if (v != null) { p[etapa] = v; ok = true; }
    }
    if (!ok) {
      // Dúvida no meio das perguntas: responde com o redator e volta à pergunta
      if (pareceDuvida(t)) {
        const x = await duvida(t);
        out.estado = 'perfil_tributario';
        if (x.tipo === 'fora_escopo') out.respostas = [];
        say(PERGUNTA_PERFIL[etapa], 'tributario');
        return;
      }
      say(T.PERFIL_NAO_ENTENDI + ' ' + (dica ? dica + ' ' : '') + PERGUNTA_PERFIL[etapa], 'tributario');
      return;
    }
    const prox = ETAPAS_PERFIL[ETAPAS_PERFIL.indexOf(etapa) + 1];
    if (prox) {
      p.etapa = prox;
      say(PERGUNTA_PERFIL[prox], 'tributario');
      return;
    }
    const res = S.perfilProvavel({ receita: p.receita, integrado: p.integrado, outra_empresa: p.outra_empresa });
    delete p.etapa;
    p.perfil = res.perfil;
    say([res.texto, ...res.alertas, T.FRASE_PADRAO_TRIBUTARIA].join('\n'), 'tributario');
    say(T.CHECKLIST, 'tributario');
    out.estado = 'tributario';
  }

  function encaminhar() {
    const tinhaNaoSei = dados.nao_sei && dados.nao_sei.pergunta;
    out.acao = 'encaminhar';
    out.motivo = tinhaNaoSei ? 'sem_resposta_segura' : 'pedido_usuario';
    out.contexto = {
      estado: conversa.estado,
      tem_conta: !!dados.ultimo_calculo,
      perfil: dados.perfil && dados.perfil.perfil ? dados.perfil.perfil : null,
      pergunta: tinhaNaoSei ? dados.nao_sei.pergunta : null,
    };
    dados.nao_sei = null;
    delete dados.coleta;
    out.estado = 'menu';
    say(T.ENCAMINHAMENTO, 'humano');
  }

  // Pedido de alerta: cultura e preço-alvo por regra; o LLM só entra se há um preço e a cultura não aparece
  async function criarAlerta(t, ext = null) {
    const nums = contarNumeros(t);
    let preco = nums.length === 1 ? nums[0] : null;
    let cultura = lerCultura(t);
    let nome = cultura ? (NOME_CULTURA[cultura] || cultura) : null;
    const daSafra = dados.safra && dados.safra.cultura ? S.normalizarCultura(dados.safra.cultura) : null;
    if (!cultura && daSafra && preco != null) { cultura = daSafra; nome = String(dados.safra.cultura).toLowerCase(); }
    if (!cultura && preco != null) {
      const e = ext || await chamarLlm(t, null);
      if (e.cultura) { cultura = S.normalizarCultura(e.cultura); nome = String(e.cultura).toLowerCase(); }
    }
    if (preco == null && ext && ext.gatilho_preco != null) preco = ext.gatilho_preco;
    if (!cultura || preco == null) {
      out.estado = 'criando_alerta';
      say(T.PEDE_GATILHO, 'gatilho');
      return;
    }
    if (!S.validarPrecoAlvo(preco)) {
      out.estado = 'criando_alerta';
      say(T.FORA_DA_FAIXA, 'gatilho');
      return;
    }
    dados.alerta = { cultura, cultura_nome: nome, preco_alvo: preco, ativo: true, criado_em: new Date().toISOString() };
    let msg = T.GATILHO_CRIADO.replace('{cultura}', nome).replace('{preco_alvo}', S.formatarReais(preco));
    const calc = dados.ultimo_calculo;
    if (calc && calc.preco_equilibrio != null && calc.cultura && S.normalizarCultura(calc.cultura) === cultura) {
      msg += ' ' + T.GATILHO_REFERENCIA_CUSTO.replace('{custo_saca}', S.formatarReais(calc.preco_equilibrio));
    }
    out.estado = 'menu';
    say(msg, 'gatilho');
  }

  // Resposta ao ALERTA_PRECO enviado por scripts/disparar-alerta.mjs
  function respostaAlerta(sim) {
    const a = dados.alerta || {};
    if (sim) {
      out.acao = 'encaminhar';
      out.motivo = 'pedido_usuario';
      out.contexto = { origem: 'alerta', cultura: a.cultura || null, preco_alvo: a.preco_alvo || null, preco_cotacao: a.disparado ? a.disparado.preco : null };
      say(T.ALERTA_RESPOSTA_SIM, 'alerta_resposta');
    } else {
      say(T.ALERTA_RESPOSTA_NAO, 'alerta_resposta');
    }
    out.estado = 'menu';
  }

  // Depois do alerta: só "sim" ou "não" respondem a ele; qualquer outra coisa sai do estado e segue como no menu
  if (conversa.estado === 'aguardando_resposta_alerta') {
    if (ehConfirmacao(texto) || ehNegacao(texto)) { respostaAlerta(ehConfirmacao(texto)); return out; }
    conversa = { ...conversa, estado: 'menu' };
    out.estado = 'menu';
  }

  const r = rotear(texto, conversa.estado);

  if (r.intencao === 'menu') {
    out.estado = 'menu';
    delete dados.coleta;
    say(T.MENU, 'menu');
  } else if (r.intencao === 'apagar') {
    out.acao = 'apagar'; // quem apaga o banco é o processar.js
    say(T.APAGADO, 'apagar');
  } else if (r.intencao === 'humano') {
    encaminhar();
  } else if (r.intencao === 'injecao') {
    say(T.FORA_ESCOPO, 'fora_escopo'); // não chega ao LLM; o estado da conversa não muda
  } else if (r.intencao === 'identidade') {
    say(T.IDENTIDADE, 'identidade');
  } else if (r.intencao === 'previsao') {
    say(T.PREVISAO, 'previsao');
  } else if (r.intencao === 'agronomo') {
    say(T.AGRONOMO, 'agronomo');
  } else if (r.intencao === 'perfil') {
    iniciarPerfil();
    if (r.resto) await perfil(r.resto);
  } else if (r.intencao === 'tributario') {
    await duvida(texto);
  } else if (r.intencao === 'resumo') {
    // Mostra só o que existe (safra e/ou perfil) e diz como completar; não muda o estado da conversa
    say(S.montarResumo(dados.safra, dados.perfil), 'resumo');
  } else if (r.intencao === 'audio') {
    if (deps.audioAtivo) {
      const desligar = /(^| )(so texto|so por texto|sem audio|para de mandar audio)( |$)/.test(normalizarTexto(texto));
      out.responde_audio = !desligar;
      say(desligar ? T.AUDIO_DESLIGADO : T.AUDIO_LIGADO, 'audio');
    } else {
      say(T.AUDIO_AINDA_NAO, 'audio');
    }
  } else if (r.intencao === 'gatilho') {
    await criarAlerta(normalizarTexto(texto) === '4' ? '' : texto); // o "4" do menu não é preço
  } else if (['alertas', 'clima', 'painel'].includes(r.intencao)) {
    say(T.EM_BREVE, r.intencao); // lista de alertas, clima e painel: Fases Plus
  } else if (r.intencao === 'fluxo') {
    if (conversa.estado === 'coletando_safra') await coletar(texto);
    else if (conversa.estado === 'criando_alerta') await criarAlerta(texto);
    else if (conversa.estado === 'perfil_tributario') await perfil(texto);
    else await confirmar(texto, r.eSe);
  } else if (r.intencao === 'safra') {
    if (r.eSe) {
      await eSe(texto); // sem conta pronta, o próprio eSe responde SEM_CONTA
    } else if (r.soPedido) {
      iniciarSafra();
      say(T.PEDE_SAFRA, 'safra');
    } else if (r.resto) {
      // "1" e mais linhas na mesma janela do debounce: pede a conta e trata o resto como resposta a ela
      iniciarSafra();
      say(T.PEDE_SAFRA, 'safra');
      await coletar(r.resto);
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

// Textos fixos da IAra. Espelham docs/CONVERSA.md (seção 1): mudou aqui, muda lá, e vice-versa.
// Números calculados NÃO ficam aqui: saem de src/calc/safra.cjs.

// Com o áudio ligado (AUDIO_ATIVO=true e chave em AUDIO_API_KEY) BOAS_VINDAS e MENU oferecem áudio; desligado, só texto.
const AUDIO = require('./audio').audioAtivo();
// Preços (dólar e cotações da demonstração) e clima, cada um atrás de uma chave do .env; a opção 5 do menu só aparece com alguma ligada
const PRECOS = String(process.env.PRECOS_ATIVO || '').toLowerCase() === 'true';
const CLIMA = String(process.env.CLIMA_ATIVO || '').toLowerCase() === 'true';

const T = {
  BOAS_VINDAS: [
    'Oi! Eu sou a IAra, assistente virtual do Agro na Medida, em demonstração no Ideathon Mandaguari 2026.',
    'Ajudo a fazer a conta da safra, a entender a reforma tributária e aviso quando o preço da saca chegar onde você quer.',
    AUDIO ? 'Pode falar comigo por texto ou por áudio.' : 'Por enquanto, me escreva por texto.',
    'Use dados de exemplo: não mande CPF, CNPJ nem dados bancários. Para apagar a conversa, escreva "apagar meus dados".',
  ].join('\n'),

  MENU: [
    'Como posso ajudar?',
    '1. Fazer a conta da safra',
    '2. Entender a reforma tributária',
    '3. Falar com uma pessoa',
    '4. Criar um alerta de preço da saca',
    ...(PRECOS || CLIMA ? ['5. Preços e clima'] : []),
    AUDIO ? 'Pode responder com o número ou mandar um áudio.' : 'Pode responder com o número ou escrever.',
  ].join('\n'),

  PEDE_SAFRA: [
    'Vamos fazer a conta. Me conte, do seu jeito: quantos hectares ou alqueires, quanto vai gastar no total, quantas sacas por hectare espera colher e o preço da saca.',
    'Exemplo: "10 hectares de soja, gastei 45 mil, espero 60 sacas por hectare, saca a 100 reais".',
  ].join('\n'),

  // PERGUNTA_CAMPO: um campo por vez, só o que falta
  PERGUNTA_CAMPO: {
    area_ha: 'Qual o tamanho da área? Pode ser em hectares ou alqueires.',
    custo_total: 'Quanto vai gastar no total nessa safra, mais ou menos?',
    produtividade: 'Quantas sacas por hectare você espera colher?',
    preco: 'Qual preço da saca você quer usar na conta?',
    cultura: 'Qual é a cultura? Por exemplo: soja, milho ou trigo.',
  },

  // Só na pergunta do preço, para soja, milho e trigo (valor de bot/cotacoes-demo.js); responder "usa esse" aceita o valor
  OFERTA_PRECO_REFERENCIA: 'Se quiser, uso a referência de hoje para {cultura}: R$ {valor} (valor ilustrativo da demonstração). É só responder "usa esse".',
  // Dúvida sobre o campo perguntado ("qual o tamanho da área?", "como assim?"): explica e repete a pergunta
  EXPLICA_CAMPO: {
    area_ha: 'É o tamanho da lavoura dessa safra. Pode ser em hectares ou alqueires.',
    custo_total: 'É tudo o que você vai gastar na safra: semente, adubo, defensivo, máquina, frete. Pode ser aproximado.',
    produtividade: 'É quanto você espera colher em cada hectare, pelo que costuma dar na sua terra.',
    preco: 'É o preço que você quer usar na conta: o de hoje ou o que espera vender.',
  },
  // "não sei", "não lembro", "sei lá": pode ser aproximado + dica de como estimar; depois repete a pergunta
  NAO_SEI_CAMPO: {
    area_ha: 'Sem problema, pode ser aproximado. Se não tem a medida exata, uma estimativa já serve. Lembre que 1 alqueire paulista tem 2,42 hectares.',
    custo_total: 'Sem problema, pode ser aproximado. Some semente, adubo, defensivo e operação (máquina, frete).',
    produtividade: 'Sem problema, pode ser aproximado. Pense no que sua terra costuma dar nas últimas safras.',
    preco: 'Sem problema, pode ser aproximado. Use o preço de hoje ou o que você espera vender.',
  },

  PERGUNTA_UNIDADE_AREA: 'Esses {valor} são hectares ou alqueires?',
  FORA_DA_FAIXA: 'Esse número parece fora do comum para uma safra. Pode conferir e me dizer de novo?',
  PERGUNTA_CORRECAO: 'Sem problema. Qual número está errado? Pode dizer, por exemplo: "a saca é 110". Ou escreva "sim" se estiver tudo certo.',
  CONSULTA_FALHOU: 'Não consegui consultar agora, tente de novo em instantes.',
  PEDE_CIDADE: 'De qual cidade? Escreva só o nome, por exemplo "Mandaguari".',
  CIDADE_NAO_ENCONTRADA: 'Não encontrei essa cidade no Brasil. Escreva só o nome, por exemplo "Mandaguari".',
  PRECOS_CLIMA_MENU: [
    'Posso mostrar:',
    ...(PRECOS ? ['• Dólar de agora: escreva "dólar"', '• Soja, milho, trigo ou boi gordo: escreva, por exemplo, "preço da soja"'] : []),
    ...(CLIMA ? ['• Tempo dos próximos 5 dias: escreva, por exemplo, "como está o tempo em Mandaguari"'] : []),
    ...(PRECOS ? ['Os valores de soja, milho, trigo e boi gordo são ilustrativos da demonstração.'] : []),
  ].join('\n'),
  CONFIRMA_NAO_ENTENDI: 'Não entendi. Os dados estão certos? Responda sim ou não.',
  NUMERO_SOLTO: 'Esse número é o quê? Pode dizer, por exemplo: "10 hectares", "custo de 45 mil", "60 sacas por hectare" ou "saca a 100".',
  CONFIRMA_HIPOTESE: 'Responda "sim" ou me diga os números certos.',
  NUMEROS_AMBIGUOS: 'Não consegui ligar esses números ao que cada um é.',
  NUMEROS_AMBIGUOS_LIVRE: 'Vi vários números e não sei a que cada um se refere. Me diga assim: "10 hectares, custo de 45 mil, 60 sacas por hectare e saca a 100".',
  ESE_NAO_ENTENDI: 'Não entendi o cenário. Tente assim: "e se a saca for 90?" ou "e se eu colher 20% menos?".',
  ESE_ANTES_CONFIRMAR: "Primeiro me confirme os dados com 'sim' e logo depois eu simulo esse cenário.",
  APAGADO: 'Pronto, apaguei os dados desta conversa. Se quiser recomeçar, é só escrever "oi".',
  SEM_CONTA: 'Antes, preciso da conta da safra. Escreva "1" para começar.',

  OFERTA_PROXIMO: 'Quer testar outro cenário ("e se o preço for 90?"), criar um alerta de preço ("me avisa quando passar de 95") ou entender a reforma tributária (responda 2)?',

  TEXTO_LONGO: 'Sua mensagem ficou muito longa para eu ler direito. Pode mandar uma versão mais curta?',

  PERGUNTA_TIPO_PESSOA: 'Vamos ver seu perfil na reforma. Você produz como pessoa física ou tem empresa (CNPJ) rural?',
  PERGUNTA_RECEITA: 'Qual é, mais ou menos, a sua receita bruta por ano com a produção? Pode ser um valor aproximado.',
  PERGUNTA_INTEGRADO: 'Você é produtor integrado (produz em contrato de integração, como em aves ou suínos)?',
  PERGUNTA_OUTRA_EMPRESA: 'Você tem participação em outra empresa que também atua no agro?',
  PERFIL_NAO_ENTENDI: 'Não entendi bem.',
  PERFIL_RECEITA_DICA: 'Escreva o valor completo, por exemplo "900 mil" ou "1 milhão e meio".',
  FRASE_PADRAO_TRIBUTARIA: 'Isso é orientação geral. A decisão do seu caso é com o seu contador.',
  CHECKLIST: [
    'Para levar ao contador:',
    '• Receita bruta dos últimos 12 meses',
    '• Notas de venda da produção e de compra de insumos',
    '• Participação em outras empresas',
    '• Contratos de integração, arrendamento ou parceria',
    '• Enquadramento atual informado pelo contador',
    'Quer que eu junte tudo num resumo? Escreva "resumo".',
  ].join('\n'),
  NAO_SEI_TRIBUTARIO: 'Essa eu não sei responder com segurança. Vale levar a dúvida ao seu contador. Se quiser, escreva "3" que eu registro o pedido de atendimento.',
  ENCAMINHAMENTO: 'Registrei seu pedido. Nesta demonstração, a equipe do Agro na Medida pode conversar com você aqui no evento. No produto real, o técnico ou o contador da cooperativa recebe o resumo.',
  // Dúvidas gerais do agro (prompts/agro_geral.md): explica e orienta; produto, dose e diagnóstico definitivo são do agrônomo
  AGRO_SEM_RECEITA: 'Recomendação de produto e dose precisa de receituário agronômico. Quer que eu chame um agrônomo da cooperativa? Responda "sim" ou escreva "3".',
  AGRO_FECHAMENTO: 'Para o seu caso, vale confirmar com o agrônomo. Quer que eu chame um?',
  AGRO_NAO_SEI: 'Essa eu não sei responder com segurança. Para o seu caso, vale confirmar com o agrônomo. Quer que eu chame um?',
  AGRO_SEM_PROBLEMA: 'Tudo bem. Se precisar de outra coisa, escreva "menu".',
  AGRONOMO:'Diagnóstico de lavoura, praga e adubação é com o agrônomo ou o técnico, e eu não consigo avaliar daqui. Se quiser, escreva "3" que eu registro o pedido de atendimento.',

  IDENTIDADE: 'Eu sou a IAra, uma assistente virtual do Agro na Medida. Não sou uma pessoa. Se quiser falar com alguém da equipe, escreva "3".',
  PREVISAO: 'Eu não faço previsão de preço nem de colheita. Posso fazer a conta com os números que você me passar (escreva "1") ou avisar quando o preço da saca chegar onde você quer.',

  PAPO_NO_FLUXO: 'Tudo certo por aqui, obrigada por perguntar! Vamos continuar a conta.',
  CONTINUAR_OU_MENU: 'Oi! Quer continuar a conta ou ver o menu? Escreva "continuar" ou "menu".',
  PEDE_GATILHO: 'Para criar o alerta, me diga a cultura e o preço da saca. Exemplo: "me avisa quando a soja passar de 110".',
  GATILHO_CRIADO: 'Combinado! Quando a saca de {cultura} chegar a {preco_alvo} ou mais, eu te aviso aqui.',
  GATILHO_REFERENCIA_CUSTO: 'Pela sua conta, seu custo é {custo_saca} por saca.',
  ALERTA_RESPOSTA_SIM: 'Certo, registrei. Na demonstração, a equipe fala com você aqui; no produto real, o comercial da cooperativa recebe o pedido.',
  ALERTA_RESPOSTA_NAO: 'Tudo bem. Se quiser outro alerta, é só pedir.',

  FORA_ESCOPO: 'Eu só ajudo com a conta da safra e com a reforma tributária para o produtor. Escreva "menu" para ver as opções.',
  EM_BREVE: 'Essa parte ainda não está pronta nesta versão. Escreva "1" para fazer a conta da safra ou "menu" para ver as opções.',
  AUDIO_LIGADO: 'Combinado, vou responder em áudio também. Os números continuam indo por escrito.',
  AUDIO_DESLIGADO: 'Certo, daqui pra frente só texto. Se quiser áudio de novo, escreva "manda em áudio".',
  AUDIO_NAO_ENTENDI: 'Não consegui ouvir esse áudio direito. Pode gravar de novo, mais perto do microfone, ou escrever?',
  AUDIO_LONGO: 'Esse áudio ficou longo demais para eu ouvir. Pode mandar um de até 1 minuto ou escrever?',
  SO_TEXTO_AUDIO: 'Por enquanto eu entendo só texto. Pode me mandar a pergunta escrita?',
  AUDIO_AINDA_NAO: 'Por enquanto eu entendo só texto. Pode escrever?',
  LIMITE: 'Recebi muitas mensagens seguidas. Me dá uns minutinhos e tenta de novo.',
  MANUTENCAO: 'Estou em pausa rápida para ajustes. Volto já!',
  // Aviso fixo (nunca gerado pela IA) quando a resposta passa de ESPERA_MS (3 s)
  ESPERA: 'Só um instante, já te respondo.',
  ERRO_TEMPORARIO: 'Tive um probleminha agora. Tenta de novo daqui a pouco ou, se preferir, escreva "3" para falar com uma pessoa.',
};

module.exports = T;

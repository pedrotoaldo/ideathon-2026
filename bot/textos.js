// Textos fixos da IAra. Espelham docs/CONVERSA.md (seção 1): mudou aqui, muda lá, e vice-versa.
// Números calculados NÃO ficam aqui: saem de src/calc/safra.cjs.

const T = {
  BOAS_VINDAS: [
    'Oi! Eu sou a IAra, assistente virtual do Agro na Medida, em demonstração no Ideathon Mandaguari 2026.',
    'Ajudo a fazer a conta da safra, a entender a reforma tributária e aviso quando o preço da saca chegar onde você quer.',
    'Por enquanto, me escreva por texto.',
    'Use dados de exemplo: não mande CPF, CNPJ nem dados bancários. Para apagar a conversa, escreva "apagar meus dados".',
  ].join('\n'),

  MENU: [
    'Como posso ajudar?',
    '1. Fazer a conta da safra',
    '2. Entender a reforma tributária',
    '3. Falar com uma pessoa',
    '4. Criar um alerta de preço da saca',
    'Pode responder com o número ou escrever.',
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
  },

  PERGUNTA_UNIDADE_AREA: 'Esses {valor} são hectares ou alqueires?',
  FORA_DA_FAIXA: 'Esse número parece fora do comum para uma safra. Pode conferir e me dizer de novo?',
  PERGUNTA_CORRECAO: 'Sem problema. Qual número está errado? Pode dizer, por exemplo: "a saca é 110". Ou escreva "sim" se estiver tudo certo.',
  NUMERO_SOLTO: 'Esse número é o quê? Pode dizer, por exemplo: "10 hectares", "custo de 45 mil", "60 sacas por hectare" ou "saca a 100".',
  CONFIRMA_HIPOTESE: 'Responda "sim" ou me diga os números certos.',
  NUMEROS_AMBIGUOS: 'Não consegui ligar esses números ao que cada um é.',
  NUMEROS_AMBIGUOS_LIVRE: 'Vi vários números e não sei a que cada um se refere. Me diga assim: "10 hectares, custo de 45 mil, 60 sacas por hectare e saca a 100".',
  ESE_NAO_ENTENDI: 'Não entendi o cenário. Tente assim: "e se a saca for 90?" ou "e se eu colher 20% menos?".',
  ESE_ANTES_CONFIRMAR: "Primeiro me confirme os dados com 'sim' e logo depois eu simulo esse cenário.",
  APAGADO: 'Pronto, apaguei os dados desta conversa. Se quiser recomeçar, é só escrever "oi".',
  SEM_CONTA: 'Antes, preciso da conta da safra. Escreva "1" para começar.',

  OFERTA_PROXIMO: 'Quer testar outro cenário ("e se o preço for 90?"), criar um alerta de preço ("me avisa quando passar de 95") ou entender a reforma tributária (responda 2)?',

  FORA_ESCOPO: 'Eu só ajudo com a conta da safra e com a reforma tributária para o produtor. Escreva "menu" para ver as opções.',
  EM_BREVE: 'Essa parte ainda não está pronta nesta versão. Escreva "1" para fazer a conta da safra ou "menu" para ver as opções.',
  SO_TEXTO_AUDIO: 'Por enquanto eu entendo só texto. Pode me mandar a pergunta escrita?',
  AUDIO_AINDA_NAO: 'Por enquanto eu entendo só texto. Pode escrever?',
  LIMITE: 'Recebi muitas mensagens seguidas. Me dá uns minutinhos e tenta de novo.',
  MANUTENCAO: 'Estou em pausa rápida para ajustes. Volto já!',
  ERRO_TEMPORARIO: 'Tive um probleminha agora. Tenta de novo, ou responda com 1, 2 ou 3.',
};

module.exports = T;

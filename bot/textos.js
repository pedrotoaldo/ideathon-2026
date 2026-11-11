// Textos fixos da IAra. Espelham docs/CONVERSA.md (seção 1): mudou aqui, muda lá, e vice-versa.
// Só os textos usados até a Etapa 1; os demais entram nas próximas etapas.

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

  SO_TEXTO_AUDIO: 'Por enquanto eu entendo só texto. Pode me mandar a pergunta escrita?',
  AUDIO_AINDA_NAO: 'Por enquanto eu entendo só texto. Pode escrever?',
  LIMITE: 'Recebi muitas mensagens seguidas. Me dá uns minutinhos e tenta de novo.',
  MANUTENCAO: 'Estou em pausa rápida para ajustes. Volto já!',
  ERRO_TEMPORARIO: 'Tive um probleminha agora. Tenta de novo, ou responda com 1, 2 ou 3.',
};

module.exports = T;

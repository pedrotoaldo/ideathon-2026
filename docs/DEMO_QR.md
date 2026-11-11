# DEMO_QR — runbook da demo ao vivo com QR code

Objetivo: a banca e a plateia escaneiam o QR, conversam com a IAra e tudo funciona. Se algo falhar, a apresentação continua sem depender do bot.

## 1. QR code
- Link: `https://wa.me/55DDDNUMERO?text=Oi%20IAra` (abre o WhatsApp com a mensagem pronta).
- Gerar o QR em alta resolução e testar com Android e iPhone, a 3 metros da tela projetada.
- Texto ao lado do QR: "Escaneie e mande um áudio: 'tenho 10 hectares, gastei 45 mil, espero 60 sacas, saca a 100'". Isso puxa todo mundo para o roteiro que funciona melhor.
- Aviso pequeno: "Demonstração. Use dados de exemplo."

## 2. Momento certo no pitch
1. Demo guiada: um integrante manda um áudio para a IAra com a tela do celular espelhada (ou o vídeo gravado, se der problema). A IAra entende o áudio e responde com a conta da safra.
2. Alerta ao vivo (simulado): o integrante pede "me avisa quando a soja passar de 95". Outro integrante roda `node scripts/disparar-alerta.mjs soja 98` no terminal. O alerta chega na hora, na frente da banca. Digam que a cotação foi lançada pela equipe: no piloto, ela vem da cooperativa.
3. No slide final, o QR fica fixo: "Teste agora". Mostrem o painel da safra como próximo passo (slide ou o vídeo de demonstração).
3. Não abrir o QR no começo: a plateia se distrai e o volume chega todo de uma vez.

## 3. Plano B (preparar antes)
| Falha | Plano B |
| --- | --- |
| Bot fora do ar ou lento | Vídeo gravado da demo (Etapa 6 do PLAN) |
| Número banido ou desconectado | Segunda instância com outro chip já conectada + slide com o segundo QR |
| LLM fora ou sem saldo | Fluxo segue pelo menu numérico e cálculo (não depende do LLM) |
| Internet do servidor cai | Celular do apresentador com o vídeo offline |
| Áudio do iPhone falha | Pedir para escrever; testado antes (ARCHITECTURE seção 3) |
| Chat (Gemini, provisório) fora ou sem cota | Menu numérico continua; se for trocar para a OpenAI, mudar só o `.env` e rodar os Roteiros A a D |
| Voz da IAra (TTS) ou transcrição (OpenAI) falha | A IAra responde só por texto automaticamente |
| Alerta não chega | Mostrar o print do alerta gravado no ensaio; conferir `conversa.dados.alerta` |

## 4. Checklist
**Na véspera**
- [ ] Roteiros A, B, C e D passando (`qa-conversa`)
- [ ] Teste de carga com 30 envios simultâneos
- [ ] Limite de gasto do provedor de IA configurado
- [ ] Base tributária revisada (ou, no mínimo, lida por alguém da equipe com o aviso de pendência)
- [ ] Vídeo da demo gravado (incluindo o alerta de preço chegando)
- [ ] Roteiro E-simulado passando
- [ ] Quem vai disparar o alerta sabe rodar `node scripts/disparar-alerta.mjs <cultura> <preço>`
- [ ] Segundo chip conectado em outra instância
- [ ] Servidor sem atualizações automáticas agendadas e sem modo de suspensão

**1 hora antes**
- [ ] `SELECT valor FROM config WHERE chave = 'bot_ativo';` → true
- [ ] Mandar "oi", um áudio e o Roteiro A de dois celulares diferentes
- [ ] Desativar os alertas de teste (`dados.alerta.ativo = false`) para o alerta ao vivo funcionar
- [ ] Deixar um terminal aberto na pasta do projeto, no notebook de quem vai disparar o alerta, com o comando pronto; conferir que o bot está de pé (`npm run bot`)
- [ ] Conferir que o celular do chip está carregado e com internet
- [ ] Limpar conversas de teste se quiser começar o painel zerado

**Durante**
- [ ] Alguém da equipe acompanhando `SELECT * FROM v_demo_resumo;`
- [ ] Mesma pessoa com o kill switch pronto:
  `UPDATE config SET valor = 'false', atualizado_em = now() WHERE chave = 'bot_ativo';`

**Depois**
- [ ] Anotar números de uso para usar como prova (conversas, áudios, alertas, latência média)
- [ ] Desligar o bot ou deixar com aviso de demo encerrada
- [ ] Apagar dados em até 7 dias (N07)

## 5. Proteções contra a plateia
- Rate limit por número (20 mensagens em 10 min).
- Escopo fechado com resposta padrão para prompt injection, piadas e política.
- Sem dados pessoais sensíveis: aviso na boas-vindas e nada disso vai para o LLM.
- Mensagens longas e mídias diferentes de áudio recusadas com texto educado.

## 6. Frases prontas para a banca

**Sobre o alerta:** "A IAra não diz para vender. Ela avisa que o preço chegou onde o produtor escolheu e mostra quanto sobra por saca. A decisão é dele."

**Sobre o número:**
"Na demo usamos uma conexão não oficial para prototipar rápido. No piloto, migramos para a API oficial do WhatsApp na mesma plataforma, sem reescrever o fluxo."

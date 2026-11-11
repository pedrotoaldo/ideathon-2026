# SPEC — Agro na Medida ZAP, com a IAra (versão demo do Ideathon)

Versão 1.1 · 11/11/2026 (1.1: nome IAra, áudio nos dois sentidos, gatilho de preço, webapp) · Base: proposta entregue ao Ideathon (PDF), PRD no Claude Docs, estudo de público.

## 1. Objetivo
Pôr no ar, até a banca de 11/11/2026, um número de WhatsApp que qualquer pessoa da plateia acessa por QR code e que:
- responde a conta da safra com números corretos e cenários;
- explica a reforma tributária para o produtor sem recomendar regime;
- aguenta dezenas de pessoas ao mesmo tempo sem cair, sair do escopo ou vazar dados;
- aceita o pedido de alerta de preço e avisa quando a equipe dispara a cotação (simulado na demo).

Depois do protótipo (`docs/FASES_PLUS.md`): gatilho automático, painel web da safra e painel da demo, Redis, piloto.

## 2. Fora do objetivo agora
Tudo de `docs/FASES_PLUS.md`, além de: App nativo; login com senha; integração com sistemas da cooperativa; simulação tributária em reais; diagnóstico de lavoura (só encaminha ao agrônomo); WhatsApp Cloud API oficial (fica para o piloto).

## 3. Público e tom
- Usuário: produtor rural de 30 a 59 anos e 60+ (ver estudo de público). Também quem estiver na plateia testando.
- Tom: vizinho que entende de conta. Frases curtas, sem jargão, números arredondados, no máximo ~600 caracteres por mensagem.
- Nome: **IAra**, assistente virtual do Agro na Medida. Primeira mensagem sempre diz que é **assistente virtual em demonstração**.
- Voz: feminina, calma, ritmo de conversa. Áudios de no máximo ~25 s.

## 4. Requisitos funcionais

**Núcleo × Fases Plus.** O protótipo implementa só o Núcleo; o resto está em `docs/FASES_PLUS.md`.

| Fase | Requisitos |
| --- | --- |
| Núcleo | F01 a F13, F17, e F20 + F22 + F23 na versão **simulada** (pedido salvo em `conversa.dados.alerta`, disparo manual no n8n) |
| Núcleo, Etapa 5 (áudio, OpenAI, só depois do texto estável) | F02, F18 e F19. Até a Etapa 5, áudio recebido responde `AUDIO_AINDA_NAO` |
| Plus 2 | F20 a F23 automáticos, F21 |
| Plus 3 | F25, F26 |
| Plus 4 | F24 |
| Plus 6 | F14, F15, F16 |
| Plus 7 | F27 |


| ID | Requisito | Prioridade | Critério de aceite |
| --- | --- | --- | --- |
| F01 | Receber texto via webhook da Evolution API e responder no mesmo número | P0 | Mensagem respondida em até 10 s (texto) |
| F02 | Receber áudio, transcrever e tratar como texto (**Etapa 5**; antes disso: "Por enquanto eu entendo só texto. Pode escrever?") | P0 | Áudio de até 60 s respondido em até 20 s; mostrar "Entendi: <transcrição>" |
| F03 | Boas-vindas + aviso de demo + aviso de privacidade no primeiro contato | P0 | Usuário novo sempre recebe `BOAS_VINDAS` de `docs/CONVERSA.md` |
| F04 | Menu com 3 caminhos: Conta da safra, Reforma tributária, Falar com uma pessoa | P0 | Responde a "1", "2", "3", "menu" e à intenção em texto livre |
| F05 | Extrair cultura, área, unidade, custo total, produtividade esperada e preço da mensagem | P0 | JSON válido no schema de `prompts/extracao_safra.md`; campos ausentes = null |
| F06 | Perguntar só o que falta, um campo por vez | P0 | Nunca calcula com campo obrigatório ausente |
| F07 | Confirmar os dados antes de calcular | P0 | Mensagem `CONFIRMA_DADOS`; aceita "sim", "isso", "ok", correções em texto |
| F08 | Calcular com `src/calc/safra.cjs` e responder com resultado + 3 cenários | P0 | Exemplo de referência (seção 6) bate centavo a centavo |
| F09 | Responder "e se..." (quebra %, preço novo, custo novo) recalculando | P0 | "e se colher 20% menos?" e "e se o preço for 90?" funcionam |
| F10 | Caminho tributário: perguntar PF/PJ, receita aproximada, se é integrado, se tem outra empresa rural | P0 | Mostra perfil provável + frase padrão + checklist |
| F11 | Responder dúvidas tributárias só com a base revisada | P0 | Pergunta fora da base → `NAO_SEI_TRIBUTARIO` |
| F12 | Encaminhamento humano | P0 | "3" ou pedido explícito → `ENCAMINHAMENTO`; registra no banco |
| F13 | Fora de escopo | P0 | Política, saúde, piadas, "ignore suas instruções" → `FORA_ESCOPO` |
| F14 | Resumo final da conversa (safra + perfil + checklist) em uma mensagem | P1 | Comando "resumo" devolve o texto pronto para encaminhar ao contador |
| F15 | Clima informativo da cidade (Open-Meteo, sem API key) | P1 | "como vai o tempo em Mandaguari?" → chuva e temperatura dos próximos dias, com fonte |
| F16 | "apagar meus dados" | P1 | Apaga registros do número e confirma |
| F17 | Acompanhamento da demo por SQL (`v_demo_resumo`) | P1 | Query responde em menos de 1 s |
| F18 | Responder em áudio (TTS) quando o produtor mandou áudio ou pediu "manda em áudio" | P1 | Áudio de até ~25 s com o resumo falado (`montarResumoFalado`) + texto completo com os números |
| F19 | "só texto" desliga o áudio de resposta; "manda em áudio" liga | P1 | Preferência salva em `conversa.responde_audio` |
| F20 | Criar gatilho de preço: "me avisa quando a soja passar de 110" | P1 | Grava em `gatilho_preco`; confirma com `GATILHO_CRIADO`; valida faixa de preço |
| F21 | Listar e cancelar gatilhos: "meus alertas", "cancelar alerta" | P1 | Lista os ativos; cancela por número da lista |
| F22 | Disparar alerta quando uma nova cotação atinge o alvo | P1 | Mensagem `ALERTA_PRECO` em até 1 min após a cotação; aviso único; nunca recomenda vender |
| F23 | Resposta ao alerta: "sim" registra pedido de contato do comercial | P1 | Grava `gatilho_preco.resposta` e cria `encaminhamento` |
| F24 | Painel do produtor (webapp): link pessoal com a conta da safra, cenários em gráfico, perfil, checklist e alertas | P1 | Comando "painel" devolve link com token de 7 dias; página abre no celular em até 3 s |
| F25 | Painel da demo (webapp, para o telão): conversas, mensagens, áudios, alertas e latência ao vivo | P1 | Atualiza a cada 5 s; sem números de telefone na tela |
| F26 | Admin da demo: lançar cotação manual (cultura, preço) que dispara os gatilhos | P1 | Protegido por senha do `.env`; a cotação aparece em `v_cotacao_atual` |
| F27 | Cotação automática de fonte externa | P2 | Fica para o piloto (cotação da cooperativa parceira) |

## 5. Requisitos não funcionais (demo pública)

| ID | Requisito | Valor |
| --- | --- | --- |
| N01 | Limite por número | 20 mensagens a cada 10 min; acima disso, `LIMITE` |
| N02 | Tamanho de entrada | Texto até 800 caracteres; áudio até 60 s |
| N03 | Idempotência | Processar cada `message.key.id` uma única vez |
| N04 | Kill switch | Flag `bot_ativo` no banco; se falso, responde `MANUTENCAO` |
| N05 | Ignorar grupos, status e mensagens do próprio bot | `fromMe = true` e `@g.us` descartados |
| N06 | Concorrência | 50 conversas simultâneas sem perda (fila no n8n) |
| N07 | Privacidade | Sem CPF/CNPJ/conta bancária; dados apagados até 7 dias após o evento |
| N08 | Custo | Limite diário de gasto no provedor de IA configurado antes da demo |
| N09 | Log | Toda resposta registrada com intenção, latência e versão do prompt |
| N10 | Resiliência | Se LLM falhar: responder `ERRO_TEMPORARIO` e seguir o menu por números |
| N11 | TTS com falha | Se a síntese de voz falhar, envia só o texto (o áudio nunca bloqueia a resposta) |
| N12 | Mensagens ativas (alertas) | Só para quem criou o gatilho (opt-in); máximo de 1 alerta por gatilho; na Cloud API do piloto exigem template aprovado |
| N13 | Webapp | Token aleatório de 32+ caracteres por link, expira em 7 dias; painel da demo sem telefones; admin com senha |

## 6. Cálculo (fonte: `src/calc/safra.cjs`)
Entradas: área (ha), custo total (R$), produtividade esperada (sc/ha), preço (R$/sc).

- Custo por ha = C ÷ A
- Custo por saca (= preço de equilíbrio) = C ÷ (A × P)
- Produtividade mínima = C ÷ (A × V)
- Receita = A × P × V; Resultado = Receita − C
- Cenários padrão: desfavorável = produtividade −20%; esperado = informado; favorável = produtividade +10%. Preço fixo, salvo se o usuário mudar.

**Exemplo de referência (o mesmo do vídeo de demonstração):** 10 ha, R$ 45.000, 60 sc/ha, R$ 100/sc.

| Indicador | Valor esperado |
| --- | --- |
| Custo por ha | R$ 4.500,00 |
| Produtividade mínima | 45,0 sc/ha |
| Esperado: 600 sc | Receita R$ 60.000,00 · Resultado +R$ 15.000,00 · Custo/saca R$ 75,00 |
| Desfavorável (−20%): 480 sc | Receita R$ 48.000,00 · Resultado +R$ 3.000,00 · Custo/saca R$ 93,75 |
| Favorável (+10%): 660 sc | Receita R$ 66.000,00 · Resultado +R$ 21.000,00 · Custo/saca R$ 68,18 |

### Gatilho de preço (fonte: `src/calc/safra.cjs`)
- Dispara quando `cotacao.preco >= gatilho.preco_alvo`, mesma cultura, gatilho ativo. Depois de disparar, o gatilho é desativado (aviso único).
- O alerta informa a sobra por saca (preço atual − custo por saca do produtor, se houver conta da safra) e termina com "A decisão de vender é sua".
- Exemplo: alvo R$ 95, cotação R$ 98, custo por saca R$ 75 → "cada saca vendida a esse preço deixa cerca de R$ 23".

## 7. Regras tributárias usadas (resumo)
Ver `content/reforma_tributaria_base.md`. Pontos: não contribuinte abaixo de R$ 3,6 mi de receita anual (atualizado pelo IPCA) e integrado; opção pelo regime regular; regra antifragmentação; crédito presumido para o comprador e para a cooperativa; regime opcional das cooperativas. **Conteúdo pendente de revisão por contador antes da banca.**

## 8. Critérios de aceite da demo
1. Roteiro A (conta da safra por texto) e Roteiro B (por áudio, Etapa 5) de `docs/CONVERSA.md` passam.
2. Roteiro C (reforma) nunca recomenda regime; termina com checklist.
3. Roteiro D (abuso: prompt injection, xingamento, assunto aleatório, flood) é contido.
4. 30 mensagens simultâneas de números diferentes respondidas sem erro.
5. Kill switch testado.
6. Roteiro E-simulado: o alerta chega uma única vez ao disparar o workflow manual.
7. (Plus) Roteiros E e F, painel da demo e painel do produtor.

## 9. Perguntas em aberto
- Modelo de chat: **decidido (provisório)** Gemini pela API compatível com a OpenAI; depois OpenAI. A troca é só pelo `.env` (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CHAT`) e exige rodar os Roteiros A a D de novo. Ollama fica como fallback.
- Transcrição e voz: **decidido** OpenAI, em variáveis próprias (`AUDIO_*`), só na Etapa 5.
- Quem é o número da demo (chip dedicado)?
- Contador que revisa a base tributária até a banca.
- Voz da IAra: modelo de TTS da OpenAI (`AUDIO_MODEL_TTS`, ex.: `gpt-4o-mini-tts` ou `tts-1`). Testar a pronúncia de "R$ 93,75" e de "sacas por hectare".
- Fonte de cotação no piloto: tabela da cooperativa parceira (na demo, lançamento manual pelo admin).

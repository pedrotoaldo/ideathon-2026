# PLAN — Núcleo do protótipo (banca em 11/11/2026, 18h30)

O protótipo é enxuto de propósito: vai mudar depois da banca. Tudo que foi cortado ou simulado está em `docs/FASES_PLUS.md` e **só entra com pedido explícito**.

Regra: terminar e testar cada etapa antes de abrir a próxima. Sessão principal do Claude Code no **Sonnet**; `/clear` entre etapas (o progresso fica nos checkboxes deste arquivo).

| Etapa | Entrega | Tempo-alvo |
| --- | --- | --- |
| 0 | Infra no ar + cálculo testado | 1 h |
| 1 | Fluxo base no bot (`bot/`): recebe, filtra, deduplica, limita, responde, boas-vindas e menu | 1 h |
| 2 | Conta da safra ponta a ponta (só texto) | 2 h |
| 3 | Reforma tributária + proteção contra a plateia | 1 h 30 |
| 4 | Alerta de preço simulado | 30 min |
| 5 | Áudio: transcrição e voz da IAra (OpenAI) | 1 h |
| 6 | Ensaio e plano B | 1 h |

Real × simulado na demo:
| Item | Na demo |
| --- | --- |
| Conversa por texto (provedor de chat **provisório**, Gemini; a troca para OpenAI é só pelo `.env`), conta da safra, perfil tributário, checklist | Real |
| Áudio: transcrição do produtor e voz da IAra (OpenAI) | Real, mas só na Etapa 5. Até lá, áudio recebe `AUDIO_AINDA_NAO` ("Por enquanto eu entendo só texto. Pode escrever?") |
| Alerta de preço | Simulado: o pedido é real e fica salvo; a cotação é digitada pela equipe no comando `node scripts/disparar-alerta.mjs <cultura> <preço>` |
| Painel da safra | Slide ou o vídeo de demonstração (Plus 3 e 4) |

## Etapa 0 — Infra e cálculo
- [x] Copiar `.env.example` para `.env` e preencher (`AUDIO_API_KEY` fica para a Etapa 5)
- [x] `docker compose up -d` (Evolution API, Postgres, Redis)
- [x] `psql "$DATABASE_URL" -f db/schema.sql` (só o Núcleo; `schema_plus.sql` fica para depois) (aplicado pelo container: `docker exec -i agrozap_postgres psql -U agrozap -d agrozap < db/schema.sql`)
- [x] Criar instância na Evolution (`integration: WHATSAPP-BAILEYS`), ler o QR com o **chip dedicado da demo** e apontar o webhook (`MESSAGES_UPSERT`) para o bot em `host.docker.internal:<BOT_PORT>` (conectada em 11/11/2026 por código de pareamento; webhook em `host.docker.internal`)
- [x] `npm test` verde (14/14)

## Etapa 1 — Fluxo base no bot (serviço Node em `bot/`)
O bot do Núcleo é um serviço Node (http nativo + `pg`; Node 21 tem `fetch` e `--env-file`), não o n8n. Reaproveita `src/calc/safra.cjs` com `require`, os textos de `docs/CONVERSA.md` e os prompts de `prompts/`. Sobe com `npm run bot`; a Evolution chama `host.docker.internal:<BOT_PORT>`. O n8n é a Fase Plus 8.
- [x] Esqueleto: `bot/server.js` (responde 200 na hora e processa depois), `bot/textos.js`, `bot/db.js`, `bot/evolution.js`; `npm run bot`; webhook da instância apontando para o bot (path com sufixo aleatório do `.env`)
- [x] `scripts/simular-mensagem.mjs <numero> "<texto>"`: manda um payload `MESSAGES_UPSERT` falso ao bot e imprime a resposta (para os roteiros sem celular)
- [x] Normalizar payload (número, tipo, texto, id, fromMe, grupo)
- [x] Descartar `fromMe`, grupos, status e mídias que não sejam texto (`SO_TEXTO_AUDIO`); **áudio** responde `AUDIO_AINDA_NAO` até a Etapa 5
- [x] Idempotência pelo `message_id` em `mensagem`
- [x] Kill switch (`config.bot_ativo`) e limite por número (20 mensagens em 10 min)
- [x] Carregar ou criar `conversa`; primeiro contato → `BOAS_VINDAS` + `MENU`
- [x] Enviar via `POST /message/sendText/{instance}` (`bot/evolution.js`; confirmado no celular real)
- [x] Fila por número (mensagens do mesmo número processadas em sequência) e teste: 2 números mandando "oi" ao mesmo tempo (feito com o simulador; falta repetir com 2 celulares reais)

## Etapa 2 — Conta da safra
- [x] Roteador por regra (números do menu e palavras-chave de `docs/CONVERSA.md`); LLM só quando ambíguo
- [x] Extração com `prompts/extracao_safra.md` via `chat/completions` + `response_format: json_object` (Gemini por ora), validação do JSON e das faixas no bot, pergunta um campo por vez
- [x] Estados `coletando_safra` → `confirmando_safra` → `resultado_safra`; alqueire convertido para ha
- [x] Resposta com `RESULTADO_SAFRA`; "e se..." com `calcularESe`
- [x] Roteiro A de `docs/CONVERSA.md` e a parte em alqueire do Roteiro B (por texto, sem áudio), no simulador com o Gemini real e em `bot/cerebro.test.cjs`

- [x] "Apagar meus dados" apaga as linhas do número em `resposta`, `mensagem`, `encaminhamento` e `conversa` e confirma
- [x] "E se" durante a confirmação responde `ESE_ANTES_CONFIRMAR` e continua em `confirmando_safra`
- [x] Número solto só vai para o campo que a IAra acabou de perguntar (sem pergunta pendente, `NUMERO_SOLTO`); vários números para um campo: aceita se o texto deixa claro, senão mostra a interpretação e pede "sim"
- [x] Faixa de produtividade por cultura em `config.faixas_cultura` (soja 20 a 90, milho 40 a 200, café 10 a 80; valores iniciais a validar com um técnico): fora dela, a confirmação destaca o aviso e exige "sim, está certo"
- [x] Custo por saca acima de 2 vezes o preço: o resultado ganha "Esse resultado ficou bem fora do comum. Vale conferir os números." (`safra.cjs`)
- [x] Agrupamento de mensagens (debounce em memória, `DEBOUNCE_MS=4000`, `DEBOUNCE_MAX_MS=12000`, presença "digitando" pela Evolution) depois de idempotência, kill switch e limite e antes do roteador; "1" seguido de "2" na janela cai na regra do número solto
- [x] Regressão da conversa do celular: `bot/cerebro.test.cjs` (offline) e `npm run regressao` (bot no ar, LLM real)

## Etapa 3 — Reforma tributária e proteção
- [x] Perguntas do perfil (tipo de pessoa, receita, integrado, outra empresa) → `perfilProvavel` → `PERFIL_RESULTADO` + `CHECKLIST`
- [x] Dúvida livre → redator tributário (`prompts/agente_sistema.md` + `content/reforma_tributaria_base.md`); tokens `NAO_SEI` e `FORA_ESCOPO` viram textos fixos
- [x] Fora de escopo e prompt injection; texto acima de 800 caracteres recusado; LLM falhou → `ERRO_TEMPORARIO` e menu numérico
- [x] Encaminhamento humano ("3")
- [x] Roteiros C e D
- [x] Provedor de chat trocável só pelo `.env` (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CHAT`): ao trocar para a OpenAI, rodar os Roteiros A a D de novo
- [x] Gerar o QR `https://wa.me/55DDDNUMERO?text=Oi%20IAra`
- [x] Extras: limite por número em memória (`bot/limite.js`, não zera com "apagar meus dados"); `DEBOUNCE_MS=2500`; QR gerado por `node scripts/gerar-qr.mjs` em `docs/demo/qr-iara.png`; `qa-conversa` rodado nos Roteiros A a D

## Extra depois da Etapa 3 (pedido do usuário)
- [x] Preços e clima (pedido de 11/11, atrás de `PRECOS_ATIVO` e `CLIMA_ATIVO`): dólar real (AwesomeAPI), clima de 5 dias por cidade (Open-Meteo), cotações ilustrativas de soja, milho, trigo e boi gordo (`bot/cotacoes-demo.js`), opção 5 do menu, fallback "Não consegui consultar agora" (timeout de 5 s); sem previsão de preço e sem ligação com o alerta
- [x] Comando "resumo" (`montarResumo` em `safra.cjs`, com teste): mostra safra e/ou perfil e diz como completar o que falta
- [x] `calcularCobertura` em `safra.cjs`, com testes, **sem ligação com o bot** (Plus 9)
- [x] Plus 9, 10 e 11 descritas em `docs/FASES_PLUS.md`; Plus 7 ganhou a integração com app e CRM
- [x] Correções do teste real de 11/11 (áudio pelo celular), todas com teste e no `npm run regressao` ("11/11 (1) a (3)"): conversa expira após 30 min sem mensagem (`bot/expiracao.js`, `config.conversa_expira_min`) e volta ao menu mantendo a última conta; saudação no meio do fluxo pergunta "Quer continuar a conta ou ver o menu?"; "40 hectares" dito com a pendência de unidade substitui o número pendente; sem cultura pergunta a cultura antes de confirmar; sanidade na confirmação (`avisosSanidade`, `config.limites_sanidade`); variações de "sim" (texto e transcrição) aceitas; "Entendi: ..." também na confirmação; transcrição do áudio gravada em `mensagem.texto`

## Etapa 4 — Alerta simulado
- [x] "me avisa quando a soja passar de 95" → extrair `cultura` e `gatilho_preco`, validar com `validarPrecoAlvo`, salvar em `conversa.dados.alerta` = `{ cultura, preco_alvo, ativo: true }` → `GATILHO_CRIADO`
- [x] `node scripts/disparar-alerta.mjs <cultura> <preço>` (ex.: `soja 98`): busca conversas com alerta ativo daquela cultura e preço-alvo atingido → texto com `montarAlertaPreco` → marca `ativo: false` antes de enviar (aviso único) → envia pela Evolution e põe a conversa em `aguardando_resposta_alerta`
- [x] Resposta "sim"/"não" ao alerta → `ALERTA_RESPOSTA_SIM` (cria `encaminhamento`) ou `ALERTA_RESPOSTA_NAO`
- [x] Roteiro E-simulado (no `npm run regressao`, com `--so <prefixo>` para nunca acionar alertas reais; falta só o teste pelo celular)

## Etapa 5 — Áudio (OpenAI), só depois de a conversa por texto estar estável
Usa `AUDIO_BASE_URL`, `AUDIO_API_KEY`, `AUDIO_MODEL_TRANSCRICAO` e `AUDIO_MODEL_TTS`, separados do `LLM_*`.
- [x] Entrada: `getBase64FromMediaMessage` → `POST {AUDIO_BASE_URL}/audio/transcriptions` → segue como texto (sem eco da transcrição; removido a pedido) (testar com iPhone, `docs/ARCHITECTURE.md` seção 3); o `AUDIO_AINDA_NAO` sai do fluxo
- [x] Saída: `POST {AUDIO_BASE_URL}/audio/speech` com o resumo falado (`montarResumoFalado`) → `sendWhatsAppAudio`; áudio primeiro, texto com os números logo depois; falha no TTS → só texto
- [x] Comandos "manda em áudio" e "só texto" (`AUDIO_LIGADO`, `AUDIO_DESLIGADO`); áudio de entrada liga o áudio de resposta
- [ ] Roteiro B por áudio e Roteiro F, passos 1 a 3 (feitos no simulador; falta o teste com áudio real e `AUDIO_API_KEY` no `.env`)
- [x] Restaurar `BOAS_VINDAS` e `MENU` em `docs/CONVERSA.md` para voltar a oferecer áudio

## Etapa 6 — Ensaio
- [ ] **Esvaziar `BOT_SOMENTE_NUMEROS` no `.env`** (modo teste: hoje o bot só responde ao número de teste) e reiniciar o bot; conferir que um número qualquer recebe resposta
- [ ] Ensaio com cronômetro seguindo `docs/DEMO_QR.md`
- [ ] Teste rápido de carga: 20 a 30 mensagens de números diferentes
- [ ] Gravar vídeo da demo funcionando, com o alerta chegando (plano B)
- [ ] Bot sobe do zero com `npm run bot` e o `.env` está completo (checklist da véspera em `docs/DEMO_QR.md`)
- [ ] `revisor-guardrails` uma vez, sobre prompts, textos e uma amostra de respostas reais

## Subagentes no Núcleo
Para economizar o limite do plano, o Núcleo usa pouco subagente:
- `calc-engenheiro` só se precisar mexer no cálculo.
- `qa-conversa` uma vez ao fim da Etapa 3 (Roteiros A a D).
- `revisor-guardrails` uma vez na Etapa 6.
- `planejador`, `conselheiro`, `implementador`, `revisor-codigo` e `webapp-dev` ficam para as Fases Plus.

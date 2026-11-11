# ARCHITECTURE — Agro na Medida ZAP (assistente IAra)

## 1. Stack

| Camada | Escolha para a demo | Por quê | Piloto (depois) |
| --- | --- | --- | --- |
| Canal | WhatsApp via **Evolution API v2** (`evoapicloud/evolution-api:v2.3.7`), integração `WHATSAPP-BAILEYS` | Sobe em minutos, sem aprovação da Meta | Mesma Evolution com `WHATSAPP-BUSINESS` (Cloud API oficial) |
| Orquestração | **Bot em Node** (`bot/`: `http` nativo + `pg`, `fetch` nativo; `npm run bot`) | Código versionado e testável, reaproveita `safra.cjs` com `require`; sem instância extra | Plus 8: n8n; ou o mesmo bot em mais de um processo |
| Banco | **PostgreSQL 16** | Estado da conversa, logs, idempotência | + pgvector para RAG |
| Cache da Evolution | Redis 7 | Só cache interno da Evolution (sessão do WhatsApp). Não guarda conversas da IAra | Plus 5: fila, agrupamento de mensagens, limites, memória curta |
| Chat (LLM) | API compatível com OpenAI via HTTP Request (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CHAT`). **Provisório: Gemini**; depois OpenAI | Só `chat/completions` + `response_format`; a troca de provedor é só no `.env` (seção 7.1) | Avaliar custo |
| Transcrição — Etapa 5 | OpenAI `POST {AUDIO_BASE_URL}/audio/transcriptions` (`AUDIO_MODEL_TRANSCRICAO`) | Português bom e rápido; separado do chat | Igual |
| Voz da IAra (TTS) — Etapa 5 | OpenAI `POST {AUDIO_BASE_URL}/audio/speech` (`AUDIO_MODEL_TTS`, voz em `TTS_VOZ`) | Resposta falada curta; a Evolution converte em nota de voz | Avaliar voz regional |
| Webapp — Plus 3 e 4 | Node 21 + Fastify + `pg`, HTML/CSS/JS sem build, Chart.js por CDN | Sobe rápido, reaproveita `safra.cjs`, roda no mesmo Docker | Igual, com login |
| Clima | **Open-Meteo** (sem API key) | Grátis e simples | Igual |
| Cálculo | `src/calc/safra.cjs` importado pelo bot com `require` | Determinístico e testado | Igual |

**Rede:** a Evolution conecta para fora (WhatsApp) e chama o bot (no host, porta `BOT_PORT`) por webhook em `host.docker.internal`. Não precisa de IP público. O servidor só precisa estar ligado e com internet durante a apresentação, em qualquer lugar.

## 2. Visão geral

```
Celular da plateia ──WhatsApp──> Evolution API ──webhook──> bot (bot/server.js)
                                     ^                        │
                                     │ sendText               ├─> Postgres (estado, logs, limites)
                                     └────────────────────────┤
                                                              ├─> LLM de chat (classificar/extrair, redigir tributário; Gemini por ora)
                                                              ├─> Áudio OpenAI (Etapa 5): transcrição (áudio → texto)
                                                              ├─> Code: safra.cjs (números)
                                                              ├─> Áudio OpenAI (Etapa 5): TTS (texto → áudio da IAra)
                                                              └─> Open-Meteo (clima, P1)

Equipe ──node scripts/disparar-alerta.mjs──> Postgres + Evolution ──alerta──> produtor   (Plus 2: admin do webapp ──cotação──> gatilhos automáticos)
Webapp /demo (telão) e /p/<token> (produtor) ──leitura──> Postgres (+ safra.cjs para os números)
```

## 3. Bot do Núcleo (`bot/`)

Serviço Node único, sem framework: `http` nativo, `pg`, `fetch` nativo; `node --env-file=.env bot/server.js` (`npm run bot`). Porta `BOT_PORT` (padrão 3000). A Evolution chama `POST /webhook/<sufixo aleatório>` (`BOT_WEBHOOK_URL`); o bot responde **200 na hora** e processa em seguida.

Módulos:
| Arquivo | Função |
| --- | --- |
| `bot/server.js` | Servidor HTTP: `POST <path do BOT_WEBHOOK_URL>` (outros paths: 404), `GET /health` → `{"ok":true}`; entrega o evento à fila por número |
| `bot/normalizar.js` | Extrai `numero` (remoteJid sem sufixo), `message_id`, `fromMe`, `isGroup`, `tipo` (texto, audio, outro), `texto`, `duracao_audio` |
| `bot/cerebro.js` | Máquina de estados (seção 4): decide texto fixo, extração, cálculo ou redator tributário |
| `bot/textos.js` | Textos fixos, copiados literalmente de `docs/CONVERSA.md` |
| `bot/llm.js` | `POST {LLM_BASE_URL}/chat/completions` (extração e redator tributário) |
| `bot/evolution.js` | `sendText` (números começando com `5500`, fictícios, nunca são enviados: servem aos testes do simulador) (e, na Etapa 5, `getBase64FromMediaMessage` e `sendWhatsAppAudio`) |
| `bot/db.js` | Pool `pg` e consultas (`conversa`, `mensagem`, `resposta`, `config`) |
| `bot/audio.js` (Etapa 5) | Transcrição e voz pela OpenAI (`AUDIO_*`) |
| `src/calc/safra.cjs` | Todos os números (importado com `require`) |
| `scripts/simular-mensagem.mjs` | Dispara payloads `MESSAGES_UPSERT` falsos contra o bot (roteiros sem celular) |
| `scripts/disparar-alerta.mjs` | Alerta de preço simulado da demo (seção 8a) |

Pipeline de cada mensagem:
| # | Passo | Função |
| --- | --- | --- |
| 1 | Receber | Webhook `MESSAGES_UPSERT`; responde 200 imediatamente |
| 2 | Normalizar | `bot/normalizar.js` |
| 3 | Descartar | `fromMe`, grupo (`@g.us`), status (`status@broadcast`), tipo `outro` → fim (tipo outro responde `SO_TEXTO_AUDIO`; até a Etapa 5, tipo audio responde `AUDIO_AINDA_NAO`) |
| 4 | Idempotência | `INSERT INTO mensagem(message_id, ...) ON CONFLICT DO NOTHING RETURNING id`; vazio → fim |
| 5 | Kill switch e limite | Lê `config.bot_ativo` e conta mensagens do número nos últimos 10 min |
| 6 | Bloqueios | Inativo → `MANUTENCAO`; acima do limite → `LIMITE` (uma vez por janela) |
| 7 | Áudio (**Etapa 5**) | `getBase64FromMediaMessage` → `POST {AUDIO_BASE_URL}/audio/transcriptions` → `texto`. Antes da Etapa 5 este passo não existe: áudio responde `AUDIO_AINDA_NAO` |
| 8 | Carregar conversa | Cria `conversa` se não existe |
| 9 | Cérebro | Máquina de estados (seção 4) |
| 10 | Extração | `prompts/extracao_safra.md`, `response_format: {type: "json_object"}` + schema no prompt, validado no bot (funciona em Gemini e OpenAI) |
| 11 | Calcular safra | Funções de `src/calc/safra.cjs` |
| 12 | Redator tributário | `prompts/agente_sistema.md` + `content/reforma_tributaria_base.md` |
| 13 | Salvar estado | Atualiza `conversa.estado` e `conversa.dados` |
| 14 | Responder | (Etapa 5) se `responde_audio`: TTS do `texto_falado` → `sendWhatsAppAudio`; depois sempre `sendText`. Falha no TTS não impede o texto |
| 15 | Log | `resposta` com intenção, latência, versão do prompt |
| 16 | Erro | `try/catch` no topo do processamento: envia `ERRO_TEMPORARIO` e grava o erro; exceção nunca derruba o processo (`uncaughtException` e `unhandledRejection` só logam) |

**Log:** cada mensagem imprime uma linha no console: `[hh:mm:ss] 5544******10 tipo=texto intencao=menu 18ms` (número mascarado, tipo, intenção, latência).

Dica: o roteamento por números do menu e palavras-chave é feito em código, sem LLM. O LLM só entra quando a mensagem é ambígua ou precisa de extração. Isso reduz latência e custo com a plateia.

**Corrida por número:** mensagens do mesmo número entram numa fila em memória (uma cadeia de promises por número), processadas em ordem. Como é um processo só, isso basta; para mais de um processo, usar `pg_advisory_xact_lock(hashtext(numero))` ou `SELECT ... FOR UPDATE` (Plus 5).

**Áudio do iPhone:** há relato de erro 400 em `getBase64FromMediaMessage` com áudio vindo de iOS nas versões 2.3.7 e 2.4.0-rc2 ([issue #2550](https://github.com/evolution-foundation/evolution-api/issues/2550)). Testar com um iPhone na Etapa 5. Alternativa: ativar o envio de base64 no próprio webhook da instância e ler a mídia do payload.

## 4. Máquina de estados (`bot/cerebro.js`)

| Estado | Entrada | Ação | Próximo estado |
| --- | --- | --- | --- |
| `novo` | qualquer | `BOAS_VINDAS` + `MENU` | `menu` |
| `menu` | "1" / intenção safra | `PEDE_SAFRA` | `coletando_safra` |
| `menu` | "2" / intenção reforma | `PERGUNTA_TIPO_PESSOA` | `coletando_perfil` |
| `menu` | "3" / pede pessoa | `ENCAMINHAMENTO` | `menu` |
| `coletando_safra` | texto (áudio na Etapa 5) | extrair → mesclar em `dados.safra` → faltou campo? pergunta 1 campo : `CONFIRMA_DADOS` | `coletando_safra` ou `confirmando_safra` |
| `confirmando_safra` | sim | calcular → `RESULTADO_SAFRA` + `OFERTA_PROXIMO` | `resultado_safra` |
| `confirmando_safra` | correção | extrair e mesclar → `CONFIRMA_DADOS` | `confirmando_safra` |
| `resultado_safra` | "e se ..." | extrair alteração → recalcular → `RESULTADO_SAFRA` | `resultado_safra` |
| `coletando_perfil` | respostas | preencher `dados.perfil` (tipo, receita, integrado, outra empresa) | `perfil_pronto` quando completo |
| `perfil_pronto` | — | regra de perfil (seção 5) + `PERFIL_RESULTADO` + `CHECKLIST` | `tributario_livre` |
| `tributario_livre` | pergunta | redator tributário com base revisada | `tributario_livre` |
| qualquer | "menu", "voltar" | `MENU` | `menu` |
| qualquer | "resumo" | `RESUMO` | mantém |
| qualquer | fora de escopo | `FORA_ESCOPO` | mantém |
| qualquer | "apagar meus dados" | apaga e confirma | `novo` |
| qualquer | "me avisa quando ... passar de X" | extrair cultura e preço-alvo → validar → gravar → `GATILHO_CRIADO` | mantém |
| qualquer | "meus alertas" | lista gatilhos ativos numerados → `LISTA_GATILHOS` | `cancelando_gatilho` se houver |
| `cancelando_gatilho` | número da lista | desativa → `GATILHO_CANCELADO` | estado anterior |
| `aguardando_resposta_alerta` | "sim" / "não" | grava resposta; "sim" cria `encaminhamento` → `ALERTA_RESPOSTA_SIM` ou `ALERTA_RESPOSTA_NAO` | estado anterior |
| qualquer | "painel" | gera token → `LINK_PAINEL` | mantém |
| qualquer | "manda em áudio" / "só texto" | liga ou desliga `responde_audio` | mantém |

Etapa 5: áudio de entrada liga `responde_audio` automaticamente (a IAra responde no mesmo formato). Antes disso, áudio recebe `AUDIO_AINDA_NAO` e o estado não muda.

Campos obrigatórios da safra: `area`, `custo_total`, `produtividade_esperada`, `preco`. Cultura é opcional (padrão "safra").

## 5. Regra de perfil provável (determinística, não é LLM)

```
limite = config.limite_receita_nao_contribuinte   (3.600.000, atualizado pelo IPCA)
se receita >= limite                → "Pela receita informada, você estaria acima do limite e seria contribuinte do IBS/CBS."
senão se integrado                  → "Produtor integrado tem tratamento próprio: não contribuinte, salvo se optar pelo regime regular."
senão                               → "Pela receita informada, você seria não contribuinte, com a possibilidade de optar pelo regime regular."
se receita >= 0,8 × limite          → acrescentar alerta "perto do limite"
se tem outra empresa rural          → acrescentar "as receitas podem ser somadas para o limite: revise com seu contador"
sempre                              → FRASE_PADRAO_TRIBUTARIA + CHECKLIST
```

## 6. Banco de dados
Ver `db/schema.sql`. Tabelas: `config`, `conversa`, `mensagem`, `resposta`, `encaminhamento`, `cotacao`, `gatilho_preco`, `painel_token`. Views: `v_demo_resumo`, `v_cotacao_atual`.

## 7. Integrações (referência rápida)

| Chamada | Método e rota | Corpo mínimo |
| --- | --- | --- |
| Enviar texto | `POST {EVOLUTION_URL}/message/sendText/{EVOLUTION_INSTANCE}` (header `apikey`) | `{ "number": "5544...", "text": "..." }` |
| Enviar nota de voz | `POST {EVOLUTION_URL}/message/sendWhatsAppAudio/{EVOLUTION_INSTANCE}` | `{ "number": "5544...", "audio": "<url ou base64>" }` |
| Sintetizar voz (Etapa 5) | `POST {AUDIO_BASE_URL}/audio/speech` | `model`, `voice`, `input`, `response_format` (`mp3` ou `opus`) |
| Mídia em base64 | `POST {EVOLUTION_URL}/chat/getBase64FromMediaMessage/{EVOLUTION_INSTANCE}` | `{ "message": { "key": { "id": "<message_id>" } } }` |
| Transcrever (Etapa 5) | `POST {AUDIO_BASE_URL}/audio/transcriptions` (multipart) | `file`, `model`, `language=pt` |
| Chat (LLM) | `POST {LLM_BASE_URL}/chat/completions` (header `Authorization: Bearer {LLM_API_KEY}`) | `model` = `LLM_MODEL_CHAT`, `messages`, `response_format` |
| Geocodificar | `GET https://geocoding-api.open-meteo.com/v1/search?name=Mandaguari&count=1&language=pt` | — |
| Previsão | `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=America/Sao_Paulo&forecast_days=5` | — |

Conferir os corpos exatos na documentação da versão instalada antes de codar.

### 7.1 Provedor de chat provisório (Gemini → OpenAI)
- Hoje o chat roda no Gemini pela API compatível com a OpenAI (`LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`). É **provisório**: depois a conversa vai para a OpenAI.
- Regra de código: usar só o formato OpenAI (`POST /chat/completions`, `messages`, `response_format: {type: "json_object"}`, `temperature`). Nada de campos, rotas ou SDK do Gemini. O JSON de extração é validado no n8n, não confiado ao provedor.
- Troca = mudar `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL_CHAT` no `.env` e rodar os Roteiros A a D de novo. Se algo exigir mais que isso, é bug de acoplamento: corrigir no fluxo, não no provedor.
- O áudio (transcrição e voz) é outro provedor e outras variáveis (`AUDIO_*`, OpenAI): não é afetado pela troca.

## 8a. Alerta simulado do Núcleo: `scripts/disparar-alerta.mjs`

Uso: `node --env-file=.env scripts/disparar-alerta.mjs <cultura> <preço>` (ex.: `soja 98`). Roda à parte do bot, usando o mesmo `.env`, o Postgres e a Evolution.

| # | Passo | Função |
| --- | --- | --- |
| 1 | Validar argumentos | Cultura e preço numérico dentro da faixa |
| 2 | Buscar | `SELECT numero, dados FROM conversa WHERE dados->'alerta'->>'ativo' = 'true' AND lower(dados->'alerta'->>'cultura') = lower($1)` |
| 3 | Decidir | `avaliarGatilhos` de `safra.cjs`, com os gatilhos montados a partir de `dados.alerta` (+ `custo_saca` de `dados.ultimo_calculo.preco_equilibrio`) |
| 4 | Marcar | `UPDATE conversa SET dados = jsonb_set(dados, '{alerta,ativo}', 'false') WHERE numero = $1 AND dados->'alerta'->>'ativo' = 'true' RETURNING numero` **antes** de enviar (aviso único) |
| 5 | Enviar | `montarAlertaPreco` → `sendText` e põe a conversa em `aguardando_resposta_alerta` |
| 6 | Relatar | Imprime quantos alertas foram enviados e para quais números (parcialmente mascarados) |

Sem tabelas novas: tudo fica em `conversa.dados`. A versão automática é a Plus 2 (seção 8b).

## 8b. Gatilhos reais: `agro-zap-gatilhos` (Plus 2; no bot como rotina agendada, ou no n8n se a Plus 8 for feita)

| # | Nó | Função |
| --- | --- | --- |
| 1 | Webhook `POST /webhook/agro-zap-gatilhos` (header secreto) + Schedule a cada 1 min | Disparado pelo admin ao lançar cotação; o Schedule é reserva |
| 2 | Postgres | Última cotação por cultura (`v_cotacao_atual`) |
| 3 | Postgres | Gatilhos ativos da cultura + `custo_saca` do último cálculo do produtor (`conversa.dados.ultimo_calculo.preco_equilibrio`) |
| 4 | Code `avaliar_gatilhos` | `safra.cjs` decide quem dispara e monta o texto |
| 5 | Postgres | `UPDATE gatilho_preco SET ativo = false, disparado_em = now() WHERE id = $1 AND ativo RETURNING id` (se não voltar linha, outro processo já avisou: não envia) |
| 6 | Responder (sub-workflow) | Envia `ALERTA_PRECO` (texto; áudio se `responde_audio`) e põe a conversa em `aguardando_resposta_alerta` |

O passo 5 antes do envio garante **aviso único** mesmo se o webhook e o Schedule rodarem juntos.

Na Cloud API oficial (piloto), mensagem fora da janela de 24 h exige template aprovado pela Meta: o alerta vira um template de utilidade.

## 9. Webapp (`web/`) — Plus 3 e 4

| Rota | Quem usa | Conteúdo | Proteção |
| --- | --- | --- | --- |
| `GET /demo` | Telão da apresentação | Conversas, mensagens, áudios, alertas enviados, latência média, cotação atual. Atualiza a cada 5 s | Pública, sem dados pessoais |
| `GET /api/demo` | Página `/demo` | JSON de `v_demo_resumo` + `v_cotacao_atual` | Pública |
| `GET /admin` | Equipe | Formulário: cultura + preço da saca | `ADMIN_SENHA` (Basic Auth) |
| `POST /api/admin/cotacao` | Página `/admin` | Grava em `cotacao` e chama `N8N_GATILHOS_WEBHOOK_URL` | `ADMIN_SENHA` |
| `GET /p/:token` | Produtor (link pela IAra) | Conta da safra, gráfico dos 3 cenários, cotação × custo por saca, alertas ativos, perfil e checklist | Token válido e não expirado |
| `GET /api/p/:token` | Página `/p/:token` | JSON com os números calculados por `safra.cjs` | Token |

Estrutura sugerida:
```
web/
  server.mjs          Fastify, rotas acima, pool do pg
  public/demo.html    painel do telão
  public/admin.html   lançamento de cotação
  public/painel.html  painel do produtor
  public/estilo.css   identidade: verde-escuro + verde-limão, fonte grande
  Dockerfile          contexto de build na raiz do repositório, para copiar src/calc/safra.cjs para dentro da imagem
```

## 10. Segurança
- `apikey` da Evolution e chave do LLM só no `.env` (e nas credenciais do n8n, se a Plus 8 for feita).
- Porta 8080 da Evolution só na rede interna.
- Webhook do bot com path difícil de adivinhar (`BOT_WEBHOOK_URL` com sufixo aleatório); qualquer outro path recebe 404.
- Sem dados pessoais sensíveis no prompt do LLM; o número de telefone não vai para o LLM.
- Webhook de gatilhos com header secreto (`N8N_GATILHOS_SEGREDO`); admin do webapp com `ADMIN_SENHA`.
- Tokens do painel com `crypto.randomBytes(24).toString('base64url')` ou equivalente; nunca derivados do telefone.

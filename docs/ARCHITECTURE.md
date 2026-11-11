# ARCHITECTURE — Agro na Medida ZAP (assistente IAra)

## 1. Stack

| Camada | Escolha para a demo | Por quê | Piloto (depois) |
| --- | --- | --- | --- |
| Canal | WhatsApp via **Evolution API v2** (`evoapicloud/evolution-api:v2.3.7`), integração `WHATSAPP-BAILEYS` | Sobe em minutos, sem aprovação da Meta | Mesma Evolution com `WHATSAPP-BUSINESS` (Cloud API oficial) |
| Orquestração | **n8n** (instância própria da equipe) | Equipe já domina; fluxos visuais | Igual, em modo fila |
| Banco | **PostgreSQL 16** | Estado da conversa, logs, idempotência | + pgvector para RAG |
| Cache da Evolution | Redis 7 | Só cache interno da Evolution (sessão do WhatsApp). Não guarda conversas da IAra | Plus 5: fila do n8n, agrupamento de mensagens, limites, memória curta |
| LLM | API compatível com OpenAI via HTTP Request (`LLM_BASE_URL`) | Troca OpenAI ↔ Ollama só mudando o `.env` | Avaliar custo |
| Transcrição | Whisper (OpenAI `audio/transcriptions`) ou local | Português bom e rápido | Igual |
| Voz da IAra (TTS) — Plus 1 | OpenAI `audio/speech` (`LLM_MODEL_TTS`, voz em `TTS_VOZ`) | Resposta falada curta; a Evolution converte em nota de voz | Avaliar voz regional |
| Webapp — Plus 3 e 4 | Node 21 + Fastify + `pg`, HTML/CSS/JS sem build, Chart.js por CDN | Sobe rápido, reaproveita `safra.cjs`, roda no mesmo Docker | Igual, com login |
| Clima | **Open-Meteo** (sem API key) | Grátis e simples | Igual |
| Cálculo | `src/calc/safra.cjs` dentro de um Code node | Determinístico e testado | Igual |

**Rede:** a Evolution conecta para fora (WhatsApp) e chama o n8n por webhook na rede interna. Não precisa de IP público. O servidor só precisa estar ligado e com internet durante a apresentação, em qualquer lugar.

## 2. Visão geral

```
Celular da plateia ──WhatsApp──> Evolution API ──webhook──> n8n "agro-zap-entrada"
                                     ^                        │
                                     │ sendText               ├─> Postgres (estado, logs, limites)
                                     └────────────────────────┤
                                                              ├─> Whisper (áudio → texto)
                                                              ├─> LLM (classificar/extrair, redigir tributário)
                                                              ├─> Code: safra.cjs (números)
                                                              ├─> TTS (texto → áudio da IAra)
                                                              └─> Open-Meteo (clima, P1)

Admin do webapp ──cotação──> Postgres ──webhook──> n8n "agro-zap-gatilhos" ──alerta──> Evolution ──> produtor
Webapp /demo (telão) e /p/<token> (produtor) ──leitura──> Postgres (+ safra.cjs para os números)
```

## 3. Workflow principal no n8n: `agro-zap-entrada`

| # | Nó | Tipo | Função |
| --- | --- | --- | --- |
| 1 | Webhook `POST /webhook/agro-zap` | Webhook (responde 200 na hora) | Recebe `MESSAGES_UPSERT` |
| 2 | Normalizar | Code | Extrai `numero` (remoteJid sem sufixo), `message_id`, `fromMe`, `isGroup`, `tipo` (texto, audio, outro), `texto`, `duracao_audio` |
| 3 | Descartar | IF | `fromMe`, grupo (`@g.us`), status (`status@broadcast`), tipo `outro` → fim (tipo outro responde `SO_TEXTO_AUDIO`) |
| 4 | Idempotência | Postgres | `INSERT INTO mensagem(message_id, ...) ON CONFLICT DO NOTHING RETURNING id`; vazio → fim |
| 5 | Kill switch e limite | Postgres | Lê `config.bot_ativo` e conta mensagens do número nos últimos 10 min |
| 6 | Bloqueios | IF | Inativo → `MANUTENCAO`; acima do limite → `LIMITE` (uma vez por janela) |
| 7 | Áudio | IF + HTTP | `POST /chat/getBase64FromMediaMessage/{instance}` → `POST {LLM_BASE_URL}/audio/transcriptions` → `texto` |
| 8 | Carregar conversa | Postgres | `SELECT ... FOR UPDATE` em `conversa` (cria se não existe) |
| 9 | Cérebro | Code | Máquina de estados (seção 4). Decide: responder texto fixo, chamar extração, calcular, ou chamar redator tributário |
| 10 | Extração | HTTP (LLM) | `prompts/extracao_safra.md`, `response_format: json_schema` |
| 11 | Calcular safra | Code | Conteúdo de `src/calc/safra.cjs` + formatação |
| 12 | Redator tributário | HTTP (LLM) | `prompts/agente_sistema.md` + `content/reforma_tributaria_base.md` |
| 13 | Clima (P1) | HTTP | Open-Meteo geocoding + forecast |
| 14 | Salvar estado | Postgres | Atualiza `conversa.estado` e `conversa.dados` |
| 15 | Responder (sub-workflow) | Execute Workflow | Se `responde_audio`: TTS do `texto_falado` → `POST /message/sendWhatsAppAudio/{instance}`; depois sempre `POST /message/sendText/{instance}` com `{ number, text }`. Falha no TTS não impede o texto |
| 16 | Log | Postgres | `resposta` com intenção, latência, versão do prompt |
| 17 | Erro | Error Trigger (workflow separado) | Envia `ERRO_TEMPORARIO` ao número e grava erro |

Dica: o roteamento por números do menu e palavras-chave é feito no Code node, sem LLM. O LLM só entra quando a mensagem é ambígua ou precisa de extração. Isso reduz latência e custo com a plateia.

**Corrida por número:** duas mensagens do mesmo número ao mesmo tempo podem disputar o estado. O `SELECT ... FOR UPDATE` dentro de uma transação, ou `pg_advisory_xact_lock(hashtext(numero))`, resolve.

**Áudio do iPhone:** há relato de erro 400 em `getBase64FromMediaMessage` com áudio vindo de iOS nas versões 2.3.7 e 2.4.0-rc2 ([issue #2550](https://github.com/evolution-foundation/evolution-api/issues/2550)). Testar com um iPhone na Etapa 3. Alternativa: ativar o envio de base64 no próprio webhook da instância e ler a mídia do payload.

## 4. Máquina de estados (nó "Cérebro")

| Estado | Entrada | Ação | Próximo estado |
| --- | --- | --- | --- |
| `novo` | qualquer | `BOAS_VINDAS` + `MENU` | `menu` |
| `menu` | "1" / intenção safra | `PEDE_SAFRA` | `coletando_safra` |
| `menu` | "2" / intenção reforma | `PERGUNTA_TIPO_PESSOA` | `coletando_perfil` |
| `menu` | "3" / pede pessoa | `ENCAMINHAMENTO` | `menu` |
| `coletando_safra` | texto ou áudio | extrair → mesclar em `dados.safra` → faltou campo? pergunta 1 campo : `CONFIRMA_DADOS` | `coletando_safra` ou `confirmando_safra` |
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

Áudio de entrada liga `responde_audio` automaticamente (a IAra responde no mesmo formato).

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
| Sintetizar voz | `POST {LLM_BASE_URL}/audio/speech` | `model`, `voice`, `input`, `response_format` (`mp3` ou `opus`) |
| Mídia em base64 | `POST {EVOLUTION_URL}/chat/getBase64FromMediaMessage/{EVOLUTION_INSTANCE}` | `{ "message": { "key": { "id": "<message_id>" } } }` |
| Transcrever | `POST {LLM_BASE_URL}/audio/transcriptions` (multipart) | `file`, `model`, `language=pt` |
| LLM | `POST {LLM_BASE_URL}/chat/completions` | `model`, `messages`, `response_format` |
| Geocodificar | `GET https://geocoding-api.open-meteo.com/v1/search?name=Mandaguari&count=1&language=pt` | — |
| Previsão | `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=America/Sao_Paulo&forecast_days=5` | — |

Conferir os corpos exatos na documentação da versão instalada antes de codar.

## 8a. Alerta simulado do Núcleo: `agro-zap-alerta-demo`

| # | Nó | Função |
| --- | --- | --- |
| 1 | Manual Trigger ou Form Trigger do n8n | Campos: cultura e preço da saca (digitados pela equipe na demo) |
| 2 | Postgres | `SELECT numero, dados FROM conversa WHERE dados->'alerta'->>'ativo' = 'true' AND lower(dados->'alerta'->>'cultura') = lower($1)` |
| 3 | Code `avaliar_gatilhos` | Monta os gatilhos a partir de `dados.alerta` (+ `custo_saca` de `dados.ultimo_calculo.preco_equilibrio`) e decide quem dispara |
| 4 | Postgres | `UPDATE conversa SET dados = jsonb_set(dados, '{alerta,ativo}', 'false') WHERE numero = $1 AND dados->'alerta'->>'ativo' = 'true' RETURNING numero` antes de enviar (aviso único) |
| 5 | HTTP | Envia `ALERTA_PRECO` e põe a conversa em `aguardando_resposta_alerta` |

Sem tabelas novas: tudo fica em `conversa.dados`. A versão automática é a Plus 2 (seção 8b).

## 8b. Workflow de gatilhos real: `agro-zap-gatilhos` (Plus 2)

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
- `apikey` da Evolution e chave do LLM só no `.env` e nas credenciais do n8n.
- Porta 8080 da Evolution só na rede interna.
- Webhook do n8n com path difícil de adivinhar ou header secreto.
- Sem dados pessoais sensíveis no prompt do LLM; o número de telefone não vai para o LLM.
- Webhook de gatilhos com header secreto (`N8N_GATILHOS_SEGREDO`); admin do webapp com `ADMIN_SENHA`.
- Tokens do painel com `crypto.randomBytes(24).toString('base64url')` ou equivalente; nunca derivados do telefone.

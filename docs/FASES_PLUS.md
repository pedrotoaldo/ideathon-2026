# FASES PLUS — o que fica para depois do protótipo

O protótipo do Ideathon é o **Núcleo** (`docs/PLAN.md`). Tudo aqui ficou de fora de propósito: ou foi cortado, ou aparece **simulado** na demo. Cada fase é independente e pode ser implementada quando a equipe quiser.

**Regra para o Claude Code:** não implemente nada deste arquivo sem um pedido explícito ("implemente a Plus 2"). Ao implementar, siga o fluxo de subagentes do CLAUDE.md e rode `db/schema_plus.sql` quando a fase usar tabelas novas.

| Fase | O que é | Na demo do Ideathon | Esforço | Depende de |
| --- | --- | --- | --- | --- |
| Plus 1 | IAra responde em áudio | **Movida para o Núcleo, Etapa 5** (junto da transcrição, OpenAI). Nada a fazer aqui | — | — |
| Plus 2 | Gatilho de preço real | Simulado por `scripts/disparar-alerta.mjs` | 1 h 30 | Núcleo |
| Plus 3 | Webapp: painel da demo + admin de cotação | Cortado (painel vira slide) | 1 h 30 | Plus 2 para o admin |
| Plus 4 | Webapp: painel do produtor | Cortado (o vídeo de demonstração mostra a ideia) | 1 h | Plus 3 |
| Plus 5 | Redis: fila, agrupamento de mensagens, limites e memória curta | Não precisa (Postgres dá conta) | 1 a 2 h | Núcleo |
| Plus 6 | Extras: resumo, clima, apagar dados | Cortado | 1 h | Núcleo |
| Plus 7 | Piloto: Cloud API oficial, RAG, cooperativa, templates | Citado no pitch como próximo passo | dias | Plus 2 e validação |
| Plus 8 | Migrar a orquestração do bot (`bot/`) para o n8n | Não: o Núcleo roda no bot em Node | 3 a 4 h | Núcleo |

---

## Plus 1 — IAra responde em áudio (SPEC F18, F19, N11) — movida para a Etapa 5 do Núcleo
Mantida aqui só como referência técnica; os passos são os da Etapa 5 do `docs/PLAN.md`. Variáveis: `AUDIO_*` (não mais `LLM_MODEL_TTS`).
- Sub-workflow "Responder": envia o texto e, se `conversa.responde_audio`, gera o áudio antes.
- TTS: `POST {AUDIO_BASE_URL}/audio/speech` com o `texto_falado` (`montarResumoFalado` em `safra.cjs` para a conta da safra; para outros textos, o próprio texto se tiver até ~400 caracteres).
- Envio: `POST /message/sendWhatsAppAudio/{instance}` com `{ number, audio: <base64> }`; a Evolution converte para nota de voz.
- Ordem: áudio primeiro, texto com os números depois. Falha no TTS → só texto.
- Comandos "manda em áudio" e "só texto" (textos `AUDIO_LIGADO` e `AUDIO_DESLIGADO` em `docs/CONVERSA.md`).
- Aceite: Roteiro F, passos 1 a 3.

## Plus 2 — Gatilho de preço real (SPEC F20 a F23, N12)
No Núcleo, o alerta é simulado: o pedido fica em `conversa.dados.alerta` e a equipe dispara o aviso com `node scripts/disparar-alerta.mjs <cultura> <preço>`. Na Plus 2 ele vira automático:
- Tabelas `cotacao` e `gatilho_preco` (em `db/schema_plus.sql`).
- Criar, listar e cancelar alertas por conversa (`GATILHO_CRIADO`, `LISTA_GATILHOS`, `GATILHO_CANCELADO`).
- Gatilhos `agro-zap-gatilhos` (ARCHITECTURE seção 8b; rotina agendada no bot, ou workflow n8n se a Plus 8 for feita): webhook + Schedule de 1 min → última cotação → `avaliarGatilhos` → `UPDATE ... SET ativo = false ... RETURNING` **antes** de enviar (aviso único) → `ALERTA_PRECO`.
- Resposta "sim" ao alerta cria `encaminhamento` para o comercial.
- Fonte da cotação: manual pelo admin (Plus 3) ou tabela da cooperativa (Plus 7).
- Aceite: Roteiro E.

## Plus 3 — Webapp: painel da demo + admin (SPEC F25, F26, N13)
- Servidor Node 21 + Fastify + `pg` em `web/`, subido com `docker compose --profile web up -d` (ARCHITECTURE seção 9).
- `/demo`: números grandes para telão, atualiza a cada 5 s, sem telefones (`v_demo_resumo`, `v_demo_gatilhos`, `v_cotacao_atual`).
- `/admin` (senha `ADMIN_SENHA`): lançar cotação → grava em `cotacao` → chama o webhook de gatilhos.
- Executor: subagente `webapp-dev`.

## Plus 4 — Webapp: painel do produtor (SPEC F24)
- Comando "painel" gera token em `painel_token` (32+ caracteres, 7 dias) e devolve `WEB_URL/p/<token>`.
- Página mobile com conta da safra (números de `safra.cjs`), gráfico dos 3 cenários, cotação × custo por saca, alertas, perfil e checklist.
- Token inválido ou expirado → "peça um novo link para a IAra".
- Aceite: Roteiro F, passos 4 e 5.

## Plus 5 — Redis
**Hoje (Núcleo):** o Redis do `docker-compose.yml` serve só de cache interno da Evolution API (sessão e dados da instância do WhatsApp). Ele **não** guarda as conversas da IAra. O estado da conversa, as mensagens, as respostas e o limite por número ficam no Postgres, que dá conta de uma plateia de dezenas de pessoas.

**Quando vale usar Redis para a IAra:**

| Uso | Problema que resolve | Como |
| --- | --- | --- |
| Fila (queue) | Muitas mensagens ao mesmo tempo travando o processo único do bot | Fila no Redis com mais de um worker do bot (ou n8n em `EXECUTIONS_MODE=queue`, se a Plus 8 for feita) |
| Agrupar mensagens seguidas (debounce) | Produtor manda 3 mensagens picadas ("plantei 10 ha" / "de soja" / "gastei 45 mil") e a IAra responde 3 vezes | Guardar as mensagens do número numa lista no Redis com TTL de ~8 s; responder só quando o produtor para de digitar, juntando tudo |
| Limite por número | Contagem rápida sem consultar o Postgres a cada mensagem | `INCR` + `EXPIRE` por número e janela |
| Memória curta da conversa | Contexto recente para o LLM sem montar histórico do banco | Redis com TTL (no n8n: nó "Redis Chat Memory"); o Postgres continua sendo a fonte de verdade |
| Trava por número | Duas mensagens do mesmo número processadas ao mesmo tempo | `SET numero NX PX 10000` como lock |

**Regra:** o Redis é auxiliar e pode perder dados. Tudo que precisa durar (safra, perfil, alertas, consentimento, logs) continua no Postgres.

**Ordem sugerida:** debounce primeiro (melhora muito a conversa por áudio e texto picado), depois queue mode se o volume crescer.

## Plus 6 — Extras (SPEC F14 a F16)
- "resumo": junta safra, perfil e checklist numa mensagem para encaminhar ao contador.
- Clima via Open-Meteo (sem chave): chuva e temperatura dos próximos dias, sempre como informação de fonte, nunca previsão de colheita.
- "apagar meus dados": apaga as linhas do número (cascata nas tabelas Plus).

## Plus 7 — Rumo ao piloto
- Trocar a instância da Evolution para `WHATSAPP-BUSINESS` (Cloud API oficial); alertas viram templates de utilidade aprovados pela Meta.
- Base tributária revisada por contador, com RAG em pgvector e versão de conteúdo em cada resposta.
- Cotação vinda da cooperativa parceira; cadastro do cooperado; painel do gestor por perfil tributário.
- Lembretes do calendário da safra (seguro, contratos, Plano Safra) e boletim semanal ativo.
- LGPD completa: termo versionado, retenção e exportação de dados.

## Plus 8 — Migrar a orquestração para o n8n
- O Núcleo roda no bot Node (`bot/`). Esta fase recria o fluxo no n8n, se a equipe preferir fluxos visuais.
- O workflow principal `agro-zap-entrada` espelha o pipeline de `docs/ARCHITECTURE.md` seção 3, com um Code node "Calcular safra" colado de `n8n/code-nodes/calcular_safra.js` (`npm run build:n8n`).
- Variáveis: `N8N_WEBHOOK_URL` no `.env`, webhook da instância apontando para o n8n. Exportar os workflows em `n8n/workflows/`.
- Aceite: Roteiros A a D e E-simulado passam sem usar `bot/`.

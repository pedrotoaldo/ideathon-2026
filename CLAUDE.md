# Agro na Medida ZAP — instruções para o Claude Code

## O que é
**IAra** é a assistente virtual do Agro na Medida no WhatsApp, para pequenos produtores rurais de Mandaguari (Ideathon Mandaguari 2026, Desafio Agro).

**Escopo atual = Núcleo do protótipo** (`docs/PLAN.md`). O produtor manda texto (áudio só na Etapa 5 do PLAN) e a IAra responde:
1. **Conta da safra:** custo por hectare, custo por saca, produtividade mínima, preço de equilíbrio e 3 cenários.
2. **Reforma tributária:** perfil provável (LC 214/2025), explicação simples e checklist para o contador.
3. **Alerta de preço simulado:** o produtor pede o aviso; na demo, a equipe dispara a cotação com `node scripts/disparar-alerta.mjs <cultura> <preço>`.
4. **Dúvidas gerais do agro:** doença, praga, manejo, plantio, colheita e solo, em resposta curta e sem receitar defensivo (regra 11).

Na apresentação, o público escaneia um **QR code** e conversa com a IAra ao vivo. Robustez da demo é prioridade.

**Fases Plus** (`docs/FASES_PLUS.md`): gatilho real, webapp, Redis, extras, piloto e migração da orquestração para o n8n. **Não implemente nada das Fases Plus sem pedido explícito** ("implemente a Plus 2").

## Leia antes de codar
| Arquivo | Para quê |
| --- | --- |
| `docs/PLAN.md` | Etapas do Núcleo, com checkboxes; o que é real e o que é simulado |
| `docs/SPEC.md` | Requisitos e critérios de aceite (coluna Fase: Núcleo ou Plus) |
| `docs/ARCHITECTURE.md` | Stack, módulos do bot, banco, integrações |
| `docs/CONVERSA.md` | Textos da IAra, menu, intenções, roteiros de teste |
| `docs/DEMO_QR.md` | Runbook da demo ao vivo e proteção contra abuso |
| `docs/FASES_PLUS.md` | O que ficou para depois, com passos e dependências |
| `prompts/` | Prompts da extração e do redator tributário |
| `content/reforma_tributaria_base.md` | Única fonte permitida para respostas tributárias |
| `src/calc/safra.cjs` | Cálculo, regra de perfil, alerta de preço e textos com números |
| `db/schema.sql` / `db/schema_plus.sql` | Tabelas do Núcleo / das Fases Plus |

## Regras inegociáveis
1. **A IA não calcula.** Todo número sai de `src/calc/safra.cjs`. O LLM só extrai dados e explica resultados.
2. **A IA não recomenda regime tributário.** Nunca "opte por" ou "fique como". Só descreve perfil provável e manda ao contador.
3. **A IA não recomenda vender.** O alerta só avisa que o preço chegou ao alvo que o produtor escolheu; a decisão é dele.
4. **Respostas tributárias só com `content/reforma_tributaria_base.md`.** Fora disso: "não sei com segurança" + encaminhamento.
5. **Escopo fechado:** safra, custos, preço, clima, reforma tributária e dúvidas gerais do agro (doença, praga, manejo, plantio, colheita, solo; ver regra 11). Outros assuntos recebem a resposta padrão de fora de escopo.
6. **Sem previsão de colheita ou de preço.**
7. **Demo pública:** não pedir CPF, CNPJ, dados bancários ou nomes reais. Incentivar dados de exemplo.
8. **A IAra sempre se apresenta como assistente virtual.** Nunca finge ser pessoa.
9. **Áudio nunca substitui o texto quando há números** (Etapa 5 do PLAN).
10. **Todo texto para o usuário em português do Brasil**, frases curtas, linguagem de produtor.
11. **A IA não receita defensivo.** Nas dúvidas do agro (`agro_geral`, `prompts/agro_geral.md`) ela só explica doença, praga, sintomas, condições e manejo geral e cita fontes (Embrapa, IDR-Paraná). Nunca indica produto comercial, princípio ativo, dose, calda ou intervalo de aplicação, nem dá diagnóstico definitivo ("pode ser X ou Y; só confirmando no campo"). Pedido de produto ou dose recebe `AGRO_SEM_RECEITA` (receituário agronômico) e a oferta do agrônomo; `bot/agro.js` descarta qualquer saída com dose, L/ha, mL/ha, g/ha, calda, "aplique" ou nome de produto. Toda resposta agronômica termina com "Para o seu caso, vale confirmar com o agrônomo. Quer que eu chame um?".
12. **Mensagem de espera e mensagens longas** (`docs/CONVERSA.md` seção 2.2): aviso fixo "Só um instante, já te respondo." se a resposta passar de 3 s (no máximo um por mensagem, nunca gerado pela IA); respostas acima de ~600 caracteres vão em até 3 mensagens por parágrafo; falha da consulta = `ERRO_TEMPORARIO` com a oferta do "3".

## Provedores de IA (duas divisões independentes)
- **Chat** (conversa, extração da safra, redator tributário): `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_CHAT`. **Provisório: Gemini**, pela API compatível com a OpenAI; depois vai para a OpenAI. Use só `chat/completions` e `response_format` (formato OpenAI), nada específico do Gemini. A troca deve exigir só mudar essas 3 variáveis e rodar os Roteiros A a D de novo.
- **Áudio** (transcrição e voz da IAra): OpenAI, `AUDIO_BASE_URL`, `AUDIO_API_KEY`, `AUDIO_MODEL_TRANSCRICAO`, `AUDIO_MODEL_TTS`. Transcrição em `POST {AUDIO_BASE_URL}/audio/transcriptions`, voz em `POST {AUDIO_BASE_URL}/audio/speech`. **Só entra na Etapa 5 do PLAN**; até lá, áudio recebido responde "Por enquanto eu entendo só texto. Pode escrever?".

## Convenções
- **O bot do Núcleo é um serviço Node em `bot/`** (http nativo + `pg`), não o n8n. O n8n é a Fase Plus 8. O bot importa `src/calc/safra.cjs` com `require`, usa os textos de `docs/CONVERSA.md` e os prompts de `prompts/`.
- Código JS (Node 21+, CommonJS). `src/calc/safra.cjs` não tem dependências nem `import`/`export` (continua colável num Code node do n8n; `npm run build:n8n` é só da Plus 8).
- Testes: `npm test` (node:test nativo).
- Valores em reais com 2 casas; áreas convertidas para hectare (1 alqueire paulista = 2,42 ha).
- O driver `pg` devolve `numeric` como string: converter com `Number()`.
- O Redis do compose é só cache da Evolution API. Estado da conversa fica no Postgres. Uso do Redis pela IAra é a Plus 5.
- Segredos só em `.env` (nunca commitar). Ver `.env.example`.
- **`bot/textos.js` e `docs/CONVERSA.md` andam juntos:** mudou um, muda o outro na mesma alteração.
- A Evolution roda no Docker e chama o bot no host por `http://host.docker.internal:<BOT_PORT>/webhook/<sufixo>` (`BOT_WEBHOOK_URL` no `.env`).

## Comandos
```bash
npm test                              # 14 testes: cálculo, perfil, alerta, resumo falado
npm run bot                           # sobe o bot (porta BOT_PORT, padrão 3000)
npm run regressao                     # cenários de conversa contra o bot no ar (LLM real)
node scripts/simular-mensagem.mjs <numero> "<texto>"   # testa roteiros sem celular
node scripts/disparar-alerta.mjs <cultura> <preço>      # alerta simulado da demo
npm run build:n8n                     # só Plus 8: código do Code node do n8n
docker compose up -d                  # Evolution API + Postgres + Redis
psql "$DATABASE_URL" -f db/schema.sql # tabelas do Núcleo (idempotente)
```

## Subagentes (`.claude/agents/`)
Sessão principal no **Sonnet**. No Núcleo, use pouco subagente (cada um começa do zero e consome limite do plano):

| Subagente | Modelo | Quando usar |
| --- | --- | --- |
| `calc-engenheiro` | sonnet | Núcleo, só se mexer no cálculo |
| `qa-conversa` | sonnet | Núcleo, uma vez ao fim da Etapa 3 |
| `revisor-guardrails` | fable | Núcleo, uma vez na Etapa 6 (antes da banca) |
| `planejador` | opus | Fases Plus |
| `conselheiro` | opus | Fases Plus, só com decisão de verdade |
| `implementador` | sonnet | Fases Plus |
| `webapp-dev` | sonnet | Plus 3 e 4 |
| `revisor-codigo` | opus | Fases Plus |

Se o Fable não estiver disponível na conta, troque `model: fable` por `model: opus`.

Fluxo nas Fases Plus: `planejador` → (`conselheiro` se houver decisão) → implementação → `revisor-codigo` → `qa-conversa`.

## Definição de pronto para a demo
Etapas 0 a 6 do `docs/PLAN.md` marcadas, `npm test` verde e `revisor-guardrails` sem bloqueios.

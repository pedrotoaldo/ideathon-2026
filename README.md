# Agro na Medida ZAP — IAra

IAra é a assistente virtual do Agro na Medida no WhatsApp para pequenos produtores de Mandaguari. Ideathon Mandaguari 2026, Desafio Agro.

O kit tem duas partes:
- **Núcleo** (`docs/PLAN.md`): o protótipo funcional da banca. Conta da safra, perfil na reforma tributária, alerta de preço simulado, texto (áudio, em OpenAI, na Etapa 5). Cerca de 6 horas de implementação mais o ensaio.
- **Fases Plus** (`docs/FASES_PLUS.md`): o que ficou para depois, já especificado: gatilho de preço automático, webapp com painéis, Redis (fila e agrupamento entre processos), extras e piloto.

## Começar no Claude Code
1. Abra esta pasta no Claude Code e selecione o **Sonnet** com `/model`.
2. Cole o pedido:

```
Leia CLAUDE.md e docs/PLAN.md. Execute só a Etapa 0 do Núcleo.
Ao terminar, marque os checkboxes no PLAN, me diga como testar e pare.
Não implemente nada de docs/FASES_PLUS.md.
```

3. Nas etapas seguintes: "Execute a Etapa N do PLAN, marque os checkboxes e pare." Use `/clear` entre etapas.
4. Ao fim da Etapa 3: "use o qa-conversa nos roteiros A a D". Antes da banca: "use o revisor-guardrails".
5. Depois da banca, para evoluir: "implemente a Plus 2 seguindo o fluxo de subagentes do CLAUDE.md".

## Estrutura
```
CLAUDE.md                     regras, escopo (Núcleo × Plus) e subagentes
docs/PLAN.md                  Núcleo: etapas 0 a 6, real × simulado
docs/FASES_PLUS.md            Plus 1 a 7, com passos, dependências e o papel do Redis
docs/SPEC.md                  requisitos e critérios de aceite, mapeados por fase
docs/ARCHITECTURE.md          stack, módulos do bot, alerta simulado, webapp (Plus), integrações
docs/CONVERSA.md              textos da IAra e roteiros de teste
docs/DEMO_QR.md               runbook da demo ao vivo com QR code
docs/referencias/             estudo de público e PDFs do Ideathon
prompts/                      prompts do LLM (extração e tributário)
content/                      base tributária (pendente de revisão por contador)
src/calc/                     cálculo, perfil, alerta, resumo falado + testes
bot/                          bot do Núcleo: serviço Node (http nativo + pg)
scripts/                      simular-mensagem.mjs, disparar-alerta.mjs (e build-n8n.mjs, Plus 8)
n8n/                          reservado para a Plus 8 (Code node gerado e workflows)
web/                          reservado para o webapp (Plus 3 e 4)
db/schema.sql                 tabelas do Núcleo
db/schema_plus.sql            tabelas das Fases Plus
.claude/agents/               8 subagentes (3 usados no Núcleo)
docker-compose.yml            Evolution API + Postgres + Redis (+ webapp no profile "web")
```

## Comandos
```bash
npm test                 # 14 testes
npm run bot              # sobe o bot (porta BOT_PORT)
npm run build:n8n        # só Plus 8: gera n8n/code-nodes/calcular_safra.js
docker compose up -d     # infra do Núcleo
```

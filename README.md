# Agro na Medida ZAP — IAra

IAra é a assistente virtual do Agro na Medida no WhatsApp para pequenos produtores de Mandaguari. Ideathon Mandaguari 2026, Desafio Agro.

O kit tem duas partes:
- **Núcleo** (`docs/PLAN.md`): o protótipo funcional da banca. Conta da safra, perfil na reforma tributária, alerta de preço simulado, texto e áudio de entrada. Cerca de 6 horas de implementação mais o ensaio.
- **Fases Plus** (`docs/FASES_PLUS.md`): o que ficou para depois, já especificado: IAra respondendo em áudio, gatilho de preço automático, webapp com painéis, Redis (fila e agrupamento de mensagens), extras e piloto.

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
docs/PLAN.md                  Núcleo: etapas 0 a 5, real × simulado
docs/FASES_PLUS.md            Plus 1 a 7, com passos, dependências e o papel do Redis
docs/SPEC.md                  requisitos e critérios de aceite, mapeados por fase
docs/ARCHITECTURE.md          stack, workflows do n8n, alerta simulado, webapp (Plus), integrações
docs/CONVERSA.md              textos da IAra e roteiros de teste
docs/DEMO_QR.md               runbook da demo ao vivo com QR code
docs/referencias/             estudo de público e PDFs do Ideathon
prompts/                      prompts do LLM (extração e tributário)
content/                      base tributária (pendente de revisão por contador)
src/calc/                     cálculo, perfil, alerta, resumo falado + testes
scripts/build-n8n.mjs         gera o código do Code node do n8n
n8n/                          código gerado e workflows exportados
web/                          reservado para o webapp (Plus 3 e 4)
db/schema.sql                 tabelas do Núcleo
db/schema_plus.sql            tabelas das Fases Plus
.claude/agents/               8 subagentes (3 usados no Núcleo)
docker-compose.yml            Evolution API + Postgres + Redis (+ webapp no profile "web")
```

## Comandos
```bash
npm test                 # 14 testes
npm run build:n8n        # gera n8n/code-nodes/calcular_safra.js
docker compose up -d     # infra do Núcleo
```

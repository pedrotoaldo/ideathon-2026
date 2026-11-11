# PLAN — Núcleo do protótipo (banca em 11/11/2026, 18h30)

O protótipo é enxuto de propósito: vai mudar depois da banca. Tudo que foi cortado ou simulado está em `docs/FASES_PLUS.md` e **só entra com pedido explícito**.

Regra: terminar e testar cada etapa antes de abrir a próxima. Sessão principal do Claude Code no **Sonnet**; `/clear` entre etapas (o progresso fica nos checkboxes deste arquivo).

| Etapa | Entrega | Tempo-alvo |
| --- | --- | --- |
| 0 | Infra no ar + cálculo pronto no n8n | 1 h |
| 1 | Fluxo base: recebe, filtra, deduplica, limita, responde, boas-vindas e menu | 1 h |
| 2 | Conta da safra ponta a ponta (texto e áudio de entrada) | 2 h |
| 3 | Reforma tributária + proteção contra a plateia | 1 h 30 |
| 4 | Alerta de preço simulado (+ IAra em áudio, se sobrar tempo) | 30 a 60 min |
| 5 | Ensaio e plano B | 1 h |

Real × simulado na demo:
| Item | Na demo |
| --- | --- |
| Conversa por texto e áudio, conta da safra, perfil tributário, checklist | Real |
| Alerta de preço | Simulado: o pedido é real e fica salvo; a cotação é digitada pela equipe num disparo manual do n8n |
| Painel da safra | Slide ou o vídeo de demonstração (Plus 3 e 4) |
| IAra respondendo em áudio | Real se a Etapa 4 couber; senão, Plus 1 |

## Etapa 0 — Infra e cálculo
- [ ] Copiar `.env.example` para `.env` e preencher
- [ ] `docker compose up -d` (Evolution API, Postgres, Redis)
- [ ] `psql "$DATABASE_URL" -f db/schema.sql` (só o Núcleo; `schema_plus.sql` fica para depois)
- [ ] Criar instância na Evolution (`integration: WHATSAPP-BAILEYS`), ler o QR com o **chip dedicado da demo** e apontar o webhook (`MESSAGES_UPSERT`) para o n8n
- [ ] `npm test` verde e `npm run build:n8n`; colar `n8n/code-nodes/calcular_safra.js` num Code node "Calcular safra"

## Etapa 1 — Fluxo base no n8n
- [ ] Webhook → normalizar payload (número, tipo, texto, id, fromMe, grupo)
- [ ] Descartar `fromMe`, grupos, status e mídias que não sejam texto ou áudio (`SO_TEXTO_AUDIO`)
- [ ] Idempotência pelo `message_id` em `mensagem`
- [ ] Kill switch (`config.bot_ativo`) e limite por número (20 mensagens em 10 min)
- [ ] Carregar ou criar `conversa`; primeiro contato → `BOAS_VINDAS` + `MENU`
- [ ] Enviar via `POST /message/sendText/{instance}`
- [ ] Teste: 2 celulares mandando "oi" ao mesmo tempo

## Etapa 2 — Conta da safra
- [ ] Roteador por regra (números do menu e palavras-chave de `docs/CONVERSA.md`); LLM só quando ambíguo
- [ ] Áudio: `getBase64FromMediaMessage` → transcrição → segue como texto (testar com iPhone)
- [ ] Extração com `prompts/extracao_safra.md`, validação de faixas, pergunta um campo por vez
- [ ] Estados `coletando_safra` → `confirmando_safra` → `resultado_safra`; alqueire convertido para ha
- [ ] Resposta com `RESULTADO_SAFRA`; "e se..." com `calcularESe`
- [ ] Roteiros A e B de `docs/CONVERSA.md`

## Etapa 3 — Reforma tributária e proteção
- [ ] Perguntas do perfil (tipo de pessoa, receita, integrado, outra empresa) → `perfilProvavel` → `PERFIL_RESULTADO` + `CHECKLIST`
- [ ] Dúvida livre → redator tributário (`prompts/agente_sistema.md` + `content/reforma_tributaria_base.md`); tokens `NAO_SEI` e `FORA_ESCOPO` viram textos fixos
- [ ] Fora de escopo e prompt injection; texto acima de 800 caracteres recusado; LLM falhou → `ERRO_TEMPORARIO` e menu numérico
- [ ] Encaminhamento humano ("3")
- [ ] Roteiros C e D
- [ ] Gerar o QR `https://wa.me/55DDDNUMERO?text=Oi%20IAra`

## Etapa 4 — Alerta simulado (+ áudio opcional)
- [ ] "me avisa quando a soja passar de 95" → extrair `cultura` e `gatilho_preco`, validar com `validarPrecoAlvo`, salvar em `conversa.dados.alerta` = `{ cultura, preco_alvo, ativo: true }` → `GATILHO_CRIADO`
- [ ] Workflow `agro-zap-alerta-demo` com **Manual Trigger** (ou formulário do n8n) com campos cultura e preço: busca conversas com alerta ativo daquela cultura e preço-alvo atingido → texto com `montarAlertaPreco` → envia → marca `ativo: false` antes de enviar (aviso único)
- [ ] Resposta "sim"/"não" ao alerta → `ALERTA_RESPOSTA_SIM` (cria `encaminhamento`) ou `ALERTA_RESPOSTA_NAO`
- [ ] Roteiro E-simulado
- [ ] Opcional, se sobrar tempo: IAra responde em áudio (Plus 1)

## Etapa 5 — Ensaio
- [ ] Ensaio com cronômetro seguindo `docs/DEMO_QR.md`
- [ ] Teste rápido de carga: 20 a 30 mensagens de números diferentes
- [ ] Gravar vídeo da demo funcionando, com o alerta chegando (plano B)
- [ ] Exportar workflows para `n8n/workflows/`
- [ ] `revisor-guardrails` uma vez, sobre prompts, textos e uma amostra de respostas reais

## Subagentes no Núcleo
Para economizar o limite do plano, o Núcleo usa pouco subagente:
- `calc-engenheiro` só se precisar mexer no cálculo.
- `qa-conversa` uma vez ao fim da Etapa 3 (Roteiros A a D).
- `revisor-guardrails` uma vez na Etapa 5.
- `planejador`, `conselheiro`, `implementador`, `revisor-codigo` e `webapp-dev` ficam para as Fases Plus.

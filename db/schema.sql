-- Agro na Medida ZAP — schema do NÚCLEO (protótipo do Ideathon, PostgreSQL 16)
-- Tabelas das Fases Plus ficam em db/schema_plus.sql (rodar depois deste, só quando forem implementadas).
-- Banco separado do usado pela Evolution API.

CREATE TABLE IF NOT EXISTS config (
  chave  text PRIMARY KEY,
  valor  jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO config (chave, valor) VALUES
  ('bot_ativo', 'true'),
  ('limite_receita_nao_contribuinte', '3600000'),
  ('rate_limit', '{"mensagens": 20, "janela_min": 10}'),
  ('cenarios', '{"desfavoravel_pct": -20, "favoravel_pct": 10}'),
  ('versao_prompt', '"v1"'),
  ('versao_base_tributaria', '"v1-pendente-revisao"'),
  ('audio_resposta', '{"ativo": true, "max_caracteres": 400}'),
  ('alerta_simulado', '{"ativo": true}')
ON CONFLICT (chave) DO NOTHING;

-- Uma linha por número de WhatsApp
CREATE TABLE IF NOT EXISTS conversa (
  numero        text PRIMARY KEY,           -- ex.: 5544999999999 (sem @s.whatsapp.net)
  estado        text NOT NULL DEFAULT 'novo',
  dados         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { safra: {...}, perfil: {...}, ultimo_calculo: {...} }
  aviso_limite_em timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Toda mensagem recebida (idempotência + rate limit)
CREATE TABLE IF NOT EXISTS mensagem (
  message_id   text PRIMARY KEY,           -- message.key.id da Evolution
  numero       text NOT NULL,
  tipo         text NOT NULL,              -- texto | audio | outro
  texto        text,                       -- texto ou transcrição
  recebida_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensagem_numero_tempo ON mensagem (numero, recebida_em DESC);

-- Toda resposta enviada (auditoria e métricas da demo)
CREATE TABLE IF NOT EXISTS resposta (
  id            bigserial PRIMARY KEY,
  message_id    text REFERENCES mensagem(message_id) ON DELETE CASCADE,
  numero        text NOT NULL,
  intencao      text,                      -- menu | safra | tributario | humano | clima | fora_escopo | erro
  texto         text NOT NULL,
  usou_llm      boolean NOT NULL DEFAULT false,
  latencia_ms   integer,
  versao_prompt text,
  enviada_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resposta_numero ON resposta (numero, enviada_em DESC);

-- Pedidos de atendimento humano
CREATE TABLE IF NOT EXISTS encaminhamento (
  id         bigserial PRIMARY KEY,
  numero     text NOT NULL,
  motivo     text NOT NULL,                -- pedido_usuario | sem_resposta_segura
  contexto   jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Preferência de áudio: a IAra responde em áudio quando o produtor manda áudio ou pede
ALTER TABLE conversa ADD COLUMN IF NOT EXISTS responde_audio boolean NOT NULL DEFAULT false;

-- Rate limit: mensagens do número nos últimos N minutos
-- SELECT count(*) FROM mensagem WHERE numero = $1 AND recebida_em > now() - interval '10 minutes';

-- Acompanhamento da demo (F17)
CREATE OR REPLACE VIEW v_demo_resumo AS
SELECT
  (SELECT count(*) FROM conversa)                                   AS conversas,
  (SELECT count(*) FROM mensagem)                                   AS mensagens,
  (SELECT count(*) FROM mensagem WHERE tipo = 'audio')              AS audios,
  (SELECT count(*) FROM resposta WHERE intencao = 'safra')          AS respostas_safra,
  (SELECT count(*) FROM resposta WHERE intencao = 'tributario')     AS respostas_tributarias,
  (SELECT count(*) FROM conversa WHERE dados ? 'alerta')           AS alertas_pedidos,
  (SELECT round(avg(latencia_ms)) FROM resposta)                    AS latencia_media_ms;

-- Apagar dados de um número (F16)
-- DELETE FROM resposta WHERE numero = $1; DELETE FROM mensagem WHERE numero = $1;
-- DELETE FROM encaminhamento WHERE numero = $1; DELETE FROM conversa WHERE numero = $1;

-- Limpeza pós-evento (N07): apagar tudo com mais de 7 dias
-- DELETE FROM mensagem WHERE recebida_em < now() - interval '7 days'; (cascata em resposta)

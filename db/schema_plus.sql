-- Agro na Medida ZAP — schema das FASES PLUS (ver docs/FASES_PLUS.md)
-- Rodar DEPOIS de db/schema.sql, só quando a fase correspondente for implementada. Idempotente.

-- Cotações da saca (na demo, a equipe lança pelo painel admin; no piloto, vem da cooperativa)
CREATE TABLE IF NOT EXISTS cotacao (
  id          bigserial PRIMARY KEY,
  cultura     text NOT NULL,               -- soja | milho | cafe ...
  praca       text NOT NULL DEFAULT 'cooperativa',
  preco       numeric(10,2) NOT NULL,      -- R$ por saca de 60 kg
  fonte       text NOT NULL DEFAULT 'manual-demo',
  registrada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_cultura_tempo ON cotacao (cultura, registrada_em DESC);

-- Gatilhos de preço definidos pelo produtor ("me avisa quando a soja passar de 110")
CREATE TABLE IF NOT EXISTS gatilho_preco (
  id           bigserial PRIMARY KEY,
  numero       text NOT NULL REFERENCES conversa(numero) ON DELETE CASCADE,
  cultura      text NOT NULL,
  preco_alvo   numeric(10,2) NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  disparado_em timestamptz,                -- preenchido ao avisar; o gatilho é desativado (aviso único)
  resposta     text                        -- "sim" (quer contato do comercial) | "nao"
);
CREATE INDEX IF NOT EXISTS idx_gatilho_ativo ON gatilho_preco (cultura) WHERE ativo;

-- Links do painel web do produtor (acesso sem senha, por token, com validade)
CREATE TABLE IF NOT EXISTS painel_token (
  token       text PRIMARY KEY,            -- 32+ caracteres aleatórios
  numero      text NOT NULL REFERENCES conversa(numero) ON DELETE CASCADE,
  expira_em   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Última cotação por cultura (usada pelo painel e pelo fluxo de gatilhos)
CREATE OR REPLACE VIEW v_cotacao_atual AS
SELECT DISTINCT ON (cultura, praca) cultura, praca, preco, fonte, registrada_em
FROM cotacao
ORDER BY cultura, praca, registrada_em DESC, id DESC;

-- Acompanhamento da demo com gatilhos reais (Plus 2)
CREATE OR REPLACE VIEW v_demo_gatilhos AS
SELECT
  (SELECT count(*) FROM gatilho_preco)                                AS gatilhos_criados,
  (SELECT count(*) FROM gatilho_preco WHERE disparado_em IS NOT NULL) AS alertas_enviados;

-- Apagar dados (F16): gatilho_preco e painel_token saem em cascata com a conversa.

INSERT INTO config (chave, valor) VALUES
  ('gatilho', '{"ativo": true, "aviso_unico": true}')
ON CONFLICT (chave) DO NOTHING;

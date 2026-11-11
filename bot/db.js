const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
pool.on('error', (e) => console.error('[db] erro no pool:', e.message));

async function registrarMensagem(m) {
  const r = await pool.query(
    'INSERT INTO mensagem (message_id, numero, tipo, texto) VALUES ($1,$2,$3,$4) ON CONFLICT (message_id) DO NOTHING RETURNING message_id',
    [m.message_id, m.numero, m.tipo, m.texto || null],
  );
  return r.rowCount === 1;
}

async function config(chave, padrao) {
  const r = await pool.query('SELECT valor FROM config WHERE chave = $1', [chave]);
  return r.rowCount ? r.rows[0].valor : padrao;
}

async function contarMensagens(numero, janelaMin) {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM mensagem WHERE numero = $1 AND recebida_em > now() - make_interval(mins => $2)',
    [numero, janelaMin],
  );
  return r.rows[0].n;
}

async function carregarConversa(numero) {
  await pool.query('INSERT INTO conversa (numero) VALUES ($1) ON CONFLICT (numero) DO NOTHING', [numero]);
  const r = await pool.query('SELECT * FROM conversa WHERE numero = $1', [numero]);
  return r.rows[0];
}

async function salvarEstado(numero, estado, dados) {
  await pool.query(
    'UPDATE conversa SET estado = $2, dados = COALESCE($3::jsonb, dados), atualizado_em = now() WHERE numero = $1',
    [numero, estado, dados ? JSON.stringify(dados) : null],
  );
}

// true se já avisou nesta janela; senão marca agora e devolve false
async function jaAvisouLimite(numero, janelaMin) {
  const r = await pool.query(
    `UPDATE conversa SET aviso_limite_em = now()
       WHERE numero = $1 AND (aviso_limite_em IS NULL OR aviso_limite_em < now() - make_interval(mins => $2))
     RETURNING numero`,
    [numero, janelaMin],
  );
  return r.rowCount === 0;
}

async function registrarResposta({ message_id, numero, intencao, texto, usou_llm = false, latencia_ms, versao_prompt = null }) {
  await pool.query(
    'INSERT INTO resposta (message_id, numero, intencao, texto, usou_llm, latencia_ms, versao_prompt) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [message_id, numero, intencao, texto, usou_llm, latencia_ms, versao_prompt],
  );
}

module.exports = { pool, registrarMensagem, config, contarMensagens, carregarConversa, salvarEstado, jaAvisouLimite, registrarResposta };

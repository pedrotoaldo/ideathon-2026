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

async function registrarResposta({ message_id, numero, intencao, texto, usou_llm = false, latencia_ms, versao_prompt = null }) {
  await pool.query(
    'INSERT INTO resposta (message_id, numero, intencao, texto, usou_llm, latencia_ms, versao_prompt) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [message_id, numero, intencao, texto, usou_llm, latencia_ms, versao_prompt],
  );
}

async function setRespondeAudio(numero, valor) {
  await pool.query('UPDATE conversa SET responde_audio = $2 WHERE numero = $1', [numero, !!valor]);
}

// Pedido de atendimento humano (opção 3 do menu, NAO_SEI seguido de "3", alerta respondido com "sim")
async function registrarEncaminhamento({ numero, motivo, contexto = null }) {
  await pool.query('INSERT INTO encaminhamento (numero, motivo, contexto) VALUES ($1,$2,$3)', [numero, motivo, contexto ? JSON.stringify(contexto) : null]);
}

// "Apagar meus dados": remove tudo do número, na ordem das dependências
async function apagarDados(numero) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM resposta WHERE numero = $1', [numero]);
    await c.query('DELETE FROM encaminhamento WHERE numero = $1', [numero]);
    await c.query('DELETE FROM mensagem WHERE numero = $1', [numero]);
    await c.query('DELETE FROM conversa WHERE numero = $1', [numero]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { apagarDados, pool, registrarMensagem, config, carregarConversa, salvarEstado, registrarResposta, registrarEncaminhamento, setRespondeAudio };

// Alerta de preço simulado da demo: a equipe "lança a cotação" e a IAra avisa quem pediu.
// Uso: node scripts/disparar-alerta.mjs <cultura> <preço>      (ex.: soja 98)
// Para cada conversa com alerta ativo daquela cultura e preço-alvo atingido: marca ativo=false ANTES de enviar
// (aviso único), envia o ALERTA_PRECO pela Evolution e põe a conversa em aguardando_resposta_alerta.
// Se o envio falhar, o alerta volta a ficar ativo para uma nova tentativa.

// Carrega o .env sozinho (funciona também sem --env-file); os módulos do bot leem o ambiente ao carregar, por isso o import dinâmico
try { process.loadEnvFile(); } catch { /* sem .env: usa o ambiente atual */ }
const { default: db } = await import('../bot/db.js');
const { enviarTexto } = await import('../bot/evolution.js');
const { default: S } = await import('../src/calc/safra.cjs');

// Opcional: --so <prefixo> limita o disparo a números que começam com o prefixo (usado pela regressão, para nunca acionar alertas reais)
const args = process.argv.slice(2);
const iSo = args.indexOf('--so');
const prefixo = iSo >= 0 ? String(args.splice(iSo, 2)[1] || '') : '';
const [culturaArg, precoArg] = args;
const preco = Number(String(precoArg || '').replace(',', '.'));
if (!culturaArg || !Number.isFinite(preco)) {
  console.error('Uso: node scripts/disparar-alerta.mjs <cultura> <preço> [--so <prefixo>]   (ex.: soja 98)');
  process.exit(1);
}
const cultura = S.normalizarCultura(culturaArg);
const PRACA = 'cooperativa';

try {
  const q = await db.pool.query(
    `SELECT numero, estado, dados FROM conversa WHERE dados->'alerta'->>'ativo' = 'true' AND dados->'alerta'->>'cultura' = $1 AND numero LIKE $2`,
    [cultura, prefixo + '%'],
  );
  const gatilhos = q.rows.map((r) => ({ numero: r.numero, estado: r.estado, dados: r.dados, cultura, preco_alvo: Number(r.dados.alerta.preco_alvo), ativo: true }));
  const disparam = S.avaliarGatilhos({ cultura, preco, praca: PRACA }, gatilhos);
  console.log(`Cotação lançada: ${cultura} ${S.formatarReais(preco)}. Alertas ativos de ${cultura}: ${gatilhos.length}. Atingidos: ${disparam.length}.`);

  let enviados = 0;
  for (const g of disparam) {
    const a = g.dados.alerta;
    const calc = g.dados.ultimo_calculo;
    const custo_saca = calc && calc.preco_equilibrio != null && calc.cultura && S.normalizarCultura(calc.cultura) === cultura ? Number(calc.preco_equilibrio) : undefined;
    const texto = S.montarAlertaPreco({ cultura: a.cultura_nome || cultura, praca: PRACA, preco_atual: preco, preco_alvo: g.preco_alvo, custo_saca });

    // Marca como disparado antes de enviar; só quem conseguir a linha envia (evita aviso duplo)
    const u = await db.pool.query(
      `UPDATE conversa
          SET estado = 'aguardando_resposta_alerta',
              dados = jsonb_set(jsonb_set(dados, '{alerta,ativo}', 'false'), '{alerta,disparado}', $2::jsonb),
              atualizado_em = now()
        WHERE numero = $1 AND dados->'alerta'->>'ativo' = 'true'`,
      [g.numero, JSON.stringify({ preco, em: new Date().toISOString(), estado_anterior: g.estado })],
    );
    if (u.rowCount !== 1) continue;

    try {
      await enviarTexto(g.numero, texto);
      await db.registrarResposta({ message_id: null, numero: g.numero, intencao: 'alerta_preco', texto, usou_llm: false, latencia_ms: null });
      enviados++;
      console.log(`  → alerta enviado para ${String(g.numero).slice(0, 4)}****${String(g.numero).slice(-2)}`);
    } catch (e) {
      console.error(`  ✖ falha ao enviar para ${String(g.numero).slice(0, 4)}****: ${e.message}. O alerta voltou a ficar ativo.`);
      await db.pool.query(
        `UPDATE conversa
            SET estado = $2, dados = jsonb_set(dados #- '{alerta,disparado}', '{alerta,ativo}', 'true'), atualizado_em = now()
          WHERE numero = $1`,
        [g.numero, g.estado],
      );
    }
  }
  if (!disparam.length) console.log('Nenhum alerta enviado.');
  else console.log(`${enviados} alerta(s) enviado(s).`);
} finally {
  await db.pool.end();
}

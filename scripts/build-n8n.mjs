// Gera o código pronto para colar no Code node "Calcular safra" do n8n.
// Uso: node scripts/build-n8n.mjs  →  n8n/code-nodes/calcular_safra.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lib = readFileSync(new URL('../src/calc/safra.cjs', import.meta.url), 'utf8')
  .replace(/^if \(typeof module.*$/m, '');

const wrapper = `
// ---- Uso no n8n (modo "Run Once for All Items") ----
// Entrada esperada em cada item: { acao: 'calcular' | 'e_se' | 'perfil' | 'avaliar_gatilhos', dados, alteracao, perfil, limite, cenarios, cotacao, gatilhos }
return $input.all().map((item) => {
  const j = item.json;
  try {
    if (j.acao === 'calcular') {
      const calc = calcularSafra(j.dados, j.cenarios || CENARIOS_PADRAO);
      return { json: { ...j, calc, texto: montarRespostaSafra(calc), texto_falado: montarResumoFalado(calc) } };
    }
    if (j.acao === 'avaliar_gatilhos') {
      // j.cotacao = { cultura, preco, praca }; j.gatilhos = linhas da tabela gatilho_preco (+ custo_saca do produtor, se houver)
      const disparados = avaliarGatilhos(j.cotacao, j.gatilhos).map((g) => ({
        ...g,
        texto: montarAlertaPreco({ cultura: j.cotacao.cultura, praca: j.cotacao.praca, preco_atual: j.cotacao.preco, preco_alvo: g.preco_alvo, custo_saca: g.custo_saca }),
      }));
      return { json: { ...j, disparados } };
    }
    if (j.acao === 'e_se') {
      const r = calcularESe(j.dados, j.alteracao);
      return { json: { ...j, e_se: r, dados: r.dados, texto: montarRespostaESe(r) } };
    }
    if (j.acao === 'perfil') {
      const p = perfilProvavel(j.perfil || {}, j.limite || 3600000);
      return { json: { ...j, perfil_resultado: p } };
    }
    return { json: { ...j, erro: 'acao desconhecida' } };
  } catch (e) {
    return { json: { ...j, erro: e.message } };
  }
});
`;

mkdirSync(new URL('../n8n/code-nodes/', import.meta.url), { recursive: true });
writeFileSync(new URL('../n8n/code-nodes/calcular_safra.js', import.meta.url), lib + wrapper);
console.log('Gerado: n8n/code-nodes/calcular_safra.js');

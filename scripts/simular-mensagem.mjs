// Simula uma mensagem da Evolution API para testar o bot sem celular.
// Uso: node --env-file=.env scripts/simular-mensagem.mjs <numero> "<texto>" [--audio] [--imagem]
// O número deve começar com 5500 (fictício): o bot não envia nada de verdade para esses números.
// As respostas são lidas da tabela "resposta" do Postgres.

import { enviar, esperarRespostas, fechar } from './simulador.mjs';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [numero, texto = ''] = args.filter((a) => !a.startsWith('--'));
if (!numero) {
  console.error('Uso: node --env-file=.env scripts/simular-mensagem.mjs <numero 5500...> "<texto>" [--audio] [--imagem]');
  process.exit(1);
}

try {
  const id = await enviar(numero, texto, { audio: flags.includes('--audio'), imagem: flags.includes('--imagem') });
  const respostas = await esperarRespostas(id);
  const rotulo = flags.includes('--audio') ? '[áudio]' : flags.includes('--imagem') ? '[imagem]' : texto;
  console.log(`\n>>> ${numero}: ${rotulo}`);
  if (!respostas.length) console.log('(sem resposta: mensagem ignorada, duplicada, agrupada com outra ou limite já avisado)');
  for (const x of respostas) console.log(`<<< [${x.intencao}, ${x.latencia_ms}ms]\n${x.texto}\n`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await fechar();
}

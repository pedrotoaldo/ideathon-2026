// Gera amostras da mesma frase da conta da safra em várias vozes, para escolher a voz da IAra.
// Uso: node scripts/gerar-vozes.mjs [voz1 voz2 ...]   (padrão: marin coral sage). Saída: docs/demo/vozes/<voz>.mp3
// Usa o AUDIO_API_KEY do .env e as mesmas instructions do bot. Chama a OpenAI de verdade (uma frase curta por voz).

import fs from 'node:fs';
import path from 'node:path';
try { process.loadEnvFile(); } catch { /* sem .env */ }
process.env.TTS_FORMATO = 'mp3';
const { sintetizar } = await import('../bot/audio.js');
const { default: S } = await import('../src/calc/safra.cjs');

const vozes = process.argv.slice(2).length ? process.argv.slice(2) : ['marin', 'coral', 'sage'];
// A conta do teste real: 20 alqueires (48,4 ha), R$ 180.000, 70 sc/ha, saca a R$ 110
const frase = S.montarResumoFalado(S.calcularSafra({ area_ha: 48.4, custo_total: 180000, produtividade: 70, preco: 110 }));
const pasta = path.join('docs', 'demo', 'vozes');
fs.mkdirSync(pasta, { recursive: true });
console.log('Frase: ' + frase + '\n');
for (const voz of vozes) {
  process.env.TTS_VOZ = voz;
  try {
    const b64 = await sintetizar(frase);
    const arq = path.join(pasta, voz + '.mp3');
    fs.writeFileSync(arq, Buffer.from(b64, 'base64'));
    console.log(`${voz}: ${arq} (${Math.round(fs.statSync(arq).size / 1024)} KB)`);
  } catch (e) {
    console.error(`${voz}: falhou (${e.message})`);
  }
}

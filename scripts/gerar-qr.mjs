// Gera o QR code da demo em PNG de alta resolução: node scripts/gerar-qr.mjs
// Número vem de DEMO_NUMERO_WHATSAPP (.env) ou do argumento; saída padrão: docs/demo/qr-iara.png
import QRCode from 'qrcode';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const numero = process.argv[2] || process.env.DEMO_NUMERO_WHATSAPP || '554499364910';
const saida = process.argv[3] || 'docs/demo/qr-iara.png';
const url = `https://wa.me/${numero}?text=Oi%20IAra`;

mkdirSync(dirname(saida), { recursive: true });
await QRCode.toFile(saida, url, { type: 'png', width: 2000, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
console.log(`QR gerado em ${saida} (2000 x 2000 px) para ${url}`);

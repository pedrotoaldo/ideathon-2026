// Testes de regressão de conversa contra o bot no ar (usa o LLM configurado no .env e o Postgres).
// Uso: npm run regressao          (o bot precisa estar rodando: npm run bot)
// Cada cenário usa um número fictício próprio (5500...) e é apagado no fim.

import { conversar, enviar, esperarRespostas, limpar, fechar, pool } from './simulador.mjs';

const cenarios = [
  {
    nome: 'Roteiro A: conta da safra por texto (números da SPEC seção 6)',
    numero: '5500900000001',
    passos: [
      ['oi', [/Oi! Eu sou a IAra/]],
      ['1', [/Vamos fazer a conta/]],
      ['10 hectares de soja, gastei 45 mil, espero 60 sacas por hectare, saca a 100', [/Entendi: 10 ha de soja, custo de R\$ 45\.000, 60 sacas\/ha e saca a R\$ 100/]],
      ['sim', [/pelo menos 45 sacas\/ha/, /custo por saca é R\$ 75\./, /20% menos: sobram R\$ 3\.000/, /Como espera: sobram R\$ 15\.000/, /10% mais: sobram R\$ 21\.000/]],
      ['e se eu colher 20% menos, fico no prejuízo?', [/^Não, ainda sobram R\$ 3\.000/, /480 sacas/, /R\$ 48\.000/, /R\$ 93,75/]],
      ['e se a saca for 70?', [/faltariam R\$ 3\.000/]],
    ],
  },
  {
    nome: 'Regressão do celular: número solto, "60 cerca de 100" e 2 sc/ha',
    numero: '5500900000002',
    passos: [
      ['oi', [/Oi! Eu sou a IAra/]],
      ['1', [/Vamos fazer a conta/]],
      ['2', [/Esse número é o quê\?/], [/produtividade/i]],
      ['10 de soja', [/Esses 10 são hectares ou alqueires\?/]],
      ['hectares', [/Quanto vai gastar no total/]],
      ['40 mil', [/Quantas sacas por hectare/]],
      ['60 cerca de 100', [/60 são as sacas por hectare e 100 o preço da saca\?/]],
      ['sim', [/Entendi: 10 ha de soja, custo de R\$ 40\.000, 60 sacas\/ha e saca a R\$ 100/], [/Atenção/]],
      ['sim', [/custo por saca é R\$ 66,67/], [/fora do comum/]],
    ],
  },
  {
    nome: 'Regressão do celular: 2 sc/ha em soja exige "sim, está certo" e o resultado extremo avisa',
    numero: '5500900000003',
    passos: [
      ['oi', [/Oi! Eu sou a IAra/]],
      ['1', [/Vamos fazer a conta/]],
      ['10 hectares de soja, gastei 40 mil', [/sacas por hectare você espera/]],
      ['2', [/Qual preço da saca/]],
      ['60', [/Atenção: 2 sacas por hectare é bem abaixo do comum para soja\. Está certo\?/]],
      ['sim', [/Atenção: 2 sacas por hectare/], [/Pela sua conta/]],
      ['sim, está certo', [/custo por saca é R\$ 2\.000/, /Esse resultado ficou bem fora do comum\. Vale conferir os números\./]],
    ],
  },
  {
    nome: '"e se" durante a confirmação',
    numero: '5500900000004',
    passos: [
      ['oi', [/Oi! Eu sou a IAra/]],
      ['1', [/Vamos fazer a conta/]],
      ['10 hectares de soja, gastei 45 mil, espero 60 sacas por hectare, saca a 100', [/Está certo\?/]],
      ['e se a saca for 90?', [/Primeiro me confirme os dados com 'sim' e logo depois eu simulo esse cenário\./]],
      ['sim', [/Pela sua conta/]],
    ],
  },
  {
    nome: 'Apagar meus dados',
    numero: '5500900000005',
    passos: [
      ['oi', [/Oi! Eu sou a IAra/]],
      ['1', [/Vamos fazer a conta/]],
      ['apagar meus dados', [], [], { apagou: true }],
    ],
  },
];

let falhas = 0;
const falhar = (msg) => { falhas++; console.log('    ✖ ' + msg); };

for (const c of cenarios) {
  console.log(`\n${c.nome}`);
  await limpar(c.numero);
  for (const [texto, deve, naoDeve = [], extra = {}] of c.passos) {
    if (extra.apagou) {
      // "apagar meus dados": a confirmação é enviada e TUDO do número some, inclusive o registro da resposta
      await conversar(c.numero, texto, { limiteMs: 6000 });
      const q = await pool.query(
        'SELECT (SELECT count(*) FROM conversa WHERE numero = $1) + (SELECT count(*) FROM mensagem WHERE numero = $1) + (SELECT count(*) FROM resposta WHERE numero = $1) AS n',
        [c.numero],
      );
      const ok = Number(q.rows[0].n) === 0;
      console.log(`  ${ok ? '✔' : '✖'} "${texto}" (nada do número sobra no banco)`);
      if (!ok) falhar(`sobraram ${q.rows[0].n} linhas do número`);
      continue;
    }
    const respostas = await conversar(c.numero, texto);
    const todo = respostas.map((r) => r.texto).join('\n');
    const ok = respostas.length > 0 && deve.every((re) => re.test(todo)) && naoDeve.every((re) => !re.test(todo));
    console.log(`  ${ok ? '✔' : '✖'} "${texto}"`);
    if (!ok) {
      falhar(`esperado ${deve.map(String).join(' e ')}${naoDeve.length ? ' sem ' + naoDeve.map(String).join(' nem ') : ''}`);
      console.log('    obtido: ' + (todo || '(sem resposta)').replace(/\n/g, ' | ').slice(0, 400));
    }
  }
  await limpar(c.numero);
}

await fechar();
console.log(falhas ? `\n${falhas} passo(s) com falha` : '\nTodos os cenários passaram');
process.exit(falhas ? 1 : 0);

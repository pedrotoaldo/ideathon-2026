# Agro na Medida ZAP — Pitch para o Ideathon Mandaguari 2026 (v2 — Integrações MCP)

**Conceito:** o assistente da propriedade rural, pelo WhatsApp.  
**Público inicial:** produtores e cooperados no Paraná, em Minas Gerais e em Goiás.  
**Duração sugerida:** 3 a 5 minutos (dependendo do ritmo e da demonstração).  
**Status:** proposta para demonstração e validação. Integrações com a Cocari, com outros sistemas e a camada MCP são uma evolução planejada; não estão implementadas nem representam parcerias firmadas.  
**Atualização v2:** acrescenta interoperabilidade com MCP (Model Context Protocol), como cliente e, futuramente, como servidor de ferramentas.

---

## 1. Pitch principal — texto para apresentar à banca

> **E se o produtor pudesse fazer uma pergunta simples e receber não apenas uma resposta, mas uma informação que realmente o ajudasse a decidir?**
>
> Imagine o seu Antônio, produtor de soja e milho. Ele tem dúvidas sobre a lavoura, anota os gastos em lugares diferentes e precisa entender o que a reforma tributária pode mudar na sua atividade. Quando surge um problema, ele não sabe se deve procurar um técnico, um contador ou começar a fazer contas. Enquanto isso, o clima muda, a safra avança e as decisões não podem esperar.
>
> Foi para aproximar informação e decisão que criamos o **Agro na Medida ZAP**: um assistente especializado no produtor rural, acessível pelo **WhatsApp**, com texto e, como evolução, mensagens de áudio.
>
> O produtor pode perguntar: **“Minha soja está amarelada, o que preciso observar?”** O agente faz perguntas de esclarecimento, consulta orientações técnicas verificadas e, se o caso exigir um diagnóstico, organiza as informações para o agrônomo. Ele não inventa uma prescrição de manejo.
>
> Também pode perguntar: **“Gastei R$ 45 mil com dez hectares. Se eu colher 20% menos, ainda pago meus custos?”** Em vez de responder genericamente, o Agro na Medida usa um **simulador com fórmulas verificáveis**, mostra as premissas e calcula o impacto do cenário no resultado da safra.
>
> E quando a dúvida é: **“Como a reforma tributária afeta minha atividade?”**, o assistente explica os conceitos com base em conteúdo atualizado e revisado, identifica documentos necessários e prepara um resumo para o contador — sem substituir a análise tributária individual.
>
> **Mas o nosso diferencial mais importante vai além de responder perguntas.** Queremos que o Agro na Medida ZAP se torne uma ponte entre o produtor, os dados da sua propriedade e os serviços da cooperativa.
>
> A Cocari já oferece o aplicativo **Unidade Digital**, com informações sobre safra, romaneios, contratos, fixações, saldos, pedidos de insumos, títulos a pagar e receber, cotações e serviços. **Com uma parceria técnica, integrações autorizadas e consentimento do cooperado**, o nosso agente poderia acessar os dados necessários e transformar essas informações em conversas úteis.
>
> Imagine perguntar pelo WhatsApp: **“Como está minha safra? Quais entregas estão registradas? O que ainda preciso conferir antes de falar com meu técnico?”** O agente poderia consultar os dados disponibilizados pela Unidade Digital e responder de forma contextualizada, sem que o produtor precisasse reunir tudo manualmente.
>
> **E pensamos além de uma única cooperativa ou aplicativo.** Nossa evolução arquitetural prevê compatibilidade com o **MCP — Model Context Protocol**, um padrão aberto para conectar assistentes de IA a ferramentas e dados externos. Com conectores adequados, permissão do produtor e autorização das instituições, poderemos integrar aplicativos de cooperativas, ERPs rurais, dados climáticos e serviços contábeis, reaproveitando o núcleo do agente, embora cada plataforma exija um conector e permissões próprios.
>
> Isso cria uma oportunidade ainda maior: o **Agro na Medida ZAP não será apenas um chatbot; poderá ser uma camada de inteligência conectável aos serviços digitais do agro**. Um aplicativo parceiro também poderá utilizar funcionalidades do nosso agente, como simulações financeiras e resumos da safra, por interfaces padronizadas.
>
> É aí que nos diferenciamos de um chatbot genérico: **não queremos apenas explicar a agricultura; queremos conectar a realidade da propriedade ao próximo passo do produtor.** Unimos o contexto da safra, os cálculos financeiros, informações técnicas verificadas e o contato com profissionais responsáveis.
>
> Para o Ideathon, vamos demonstrar uma jornada objetiva: o produtor faz uma pergunta, informa dados básicos da lavoura, recebe uma simulação e gera um resumo para compartilhar com um especialista. As integrações com a Unidade Digital e com MCP são **etapas de evolução**, sujeitas à viabilidade técnica, permissões e acordos com cada parceiro.
>
> Nosso modelo de negócio começa como hipótese **B2B2C**: cooperativas e parceiros podem disponibilizar o assistente aos produtores, ampliando o acesso à informação e ajudando a organizar atendimentos. Precisamos validar a disposição de contratação e o ganho real de eficiência.
>
> **O Agro na Medida ZAP não pretende substituir o agrônomo, o contador ou o gerente. Ele quer fazer cada conversa com esses profissionais começar melhor.**
>
> **Agro na Medida ZAP: o produtor pergunta no WhatsApp, entende sua safra e chega mais preparado à decisão.**

---

## 2. Os seis diferenciais para destacar visualmente

| Diferencial | Benefício percebido pelo produtor | Por que importa para o negócio |
|---|---|---|
| **Conhece a safra, com autorização** | Evita repetir dados e permite acompanhar custos e produção ao longo do tempo | Potencial de recorrência e personalização |
| **Cálculos verificáveis, não apenas texto de IA** | Entende custo por hectare, produtividade de equilíbrio e efeitos de cenários | Resultado concreto que pode ser demonstrado |
| **Integração potencial com o app Unidade Digital Cocari** | Consultaria dados existentes, como safra, entregas, contratos e saldos, numa conversa simples | Conecta o agente a processos reais da cooperativa |
| **Arquitetura conectável via MCP (planejada)** | O mesmo atendimento poderá consultar diferentes aplicativos autorizados, sem o produtor copiar os dados entre sistemas | Potencial de integração com outras cooperativas, ERPs e parceiros; menor dependência de um sistema específico |
| **Encaminha ao profissional certo** | Compartilha um resumo organizado com técnico, agrônomo ou contador | Complementa a assistência e reduz retrabalho potencial |
| **Conhecimento localizado e tributário revisado** | Explicações adequadas à cultura, região e situação informada | Maior utilidade e confiança, quando houver validação técnica |

**Frase de impacto para o slide:** *“Uma IA genérica responde. O Agro na Medida ZAP conecta, com autorização, os dados da propriedade, os cálculos e os profissionais que ajudam o produtor a decidir.”*

## 3. Integração com a Unidade Digital Cocari — como explicar sem prometer algo pronto

**O que já existe no aplicativo da Cocari:** conforme informações públicas da cooperativa, a Unidade Digital disponibiliza recursos de safra, romaneios, contratos, saldos, pedidos e insumos, títulos financeiros, cotações, emissão de documentos e contato com consultores.

**O que propomos desenvolver, se houver parceria e viabilidade:**

1. Identificação e autenticação segura do cooperado.
2. Autorização granular para consultar somente os dados necessários.
3. Integração técnica com os sistemas ou APIs disponibilizados pela Cocari.
4. Respostas pelo WhatsApp fundamentadas nesses dados, com indicação da data de atualização.
5. Encaminhamento de solicitações a profissionais, com consentimento e registro do atendimento.

**Exemplo de pergunta futura:** “Com base nas entregas que constam na Unidade Digital e nos custos que registrei, qual é meu resultado estimado até agora?”

**Limite explícito:** atualmente essa conexão é uma **proposta de integração**. Não afirmar que o Agro na Medida já acessa a Cocari, que existe contrato de parceria ou que todos os dados do aplicativo estão disponíveis para uso externo.

### Como o MCP amplia essa estratégia

O **MCP (Model Context Protocol)** é um protocolo aberto de interoperabilidade entre aplicações de IA e sistemas que oferecem ferramentas, recursos ou dados. **Não significa conexão automática com qualquer aplicativo.** A plataforma de destino precisa disponibilizar um servidor MCP ou permitir uma integração autorizada por API, webhook ou outro conector que possa ser encapsulado em um servidor MCP.

**Duas funções complementares para o Agro na Medida ZAP (futuras):**

1. **Cliente MCP:** o agente usa servidores MCP existentes ou adaptadores para consultar dados permitidos de aplicativos de cooperativas, gestão rural, clima e serviços contábeis.
2. **Servidor MCP:** o Agro na Medida disponibiliza ferramentas próprias para outros sistemas autorizados, como `simular_resultado_safra`, `calcular_ponto_equilibrio`, `gerar_resumo_tecnico` e `listar_pendencias_tributarias`. Essas funções são exemplos de interface proposta, não endpoints já publicados.

**Fluxo ilustrativo:**

```text
Produtor no WhatsApp
         |
         v
Agro na Medida ZAP (IA + cálculos + regras de acesso)
         |
         +--> Cliente MCP --> Servidor MCP de parceiro (se houver)
         |                  --> Adaptador MCP para API da cooperativa (se autorizado)
         |                  --> Serviço de clima / ERP / sistemas contábeis
         |
         +--> Servidor MCP do Agro na Medida (etapa futura)
                          --> Funções disponibilizadas a apps parceiros
```

**Exemplo com a Unidade Digital Cocari:** se a cooperativa disponibilizar acesso técnico e autorizar a integração, um adaptador poderá oferecer ao agente operações de leitura limitadas, como consultar entregas e contratos do cooperado autenticado. Não está confirmado que a Cocari tenha servidor MCP, API pública para essa finalidade ou contrato de acesso conosco.

**Regras indispensáveis:** autenticar o cooperado; obter autorização específica; permitir revogação; separar dados entre propriedades; auditar consultas; não compartilhar credenciais no modelo; confirmar ações que modifiquem dados; respeitar contratos e LGPD. Inicialmente priorizar **acesso somente de leitura**.

**O que existe hoje no material técnico anexado:** orquestração planejada em n8n, webhooks, banco de dados e chamadas de APIs, além de um módulo de cálculo. **Não há implementação MCP identificada no pacote revisado.** A arquitetura atual oferece uma base para adicionar adaptadores MCP, mas MCP é trabalho futuro.


## 4. Demonstração sugerida — 45 a 60 segundos

**Cena A — pergunta agronômica (10–15 s).** O produtor digita: “Minha soja está amarelada”. O assistente pede informações relevantes e explica quando é necessário consultar um agrônomo, sem prometer diagnóstico por texto.

**Cena B — cálculo financeiro (20–25 s).** O produtor informa: “10 hectares, R$ 45 mil de custos, 60 sacas/ha, R$ 100/saca”. O agente mostra o resultado antes e depois de uma perda hipotética de 20%:

- Sem perda: 600 sacas; receita R$ 60.000; resultado estimado R$ 15.000.
- Com perda de 20%: 480 sacas; receita R$ 48.000; resultado estimado R$ 3.000.
- Preço de equilíbrio no cenário de perda: R$ 93,75 por saca.

*Valores fictícios e custos mantidos constantes, apenas para demonstração. O resultado depende das despesas efetivamente informadas.*

**Cena C — próximo passo (15–20 s).** O agente prepara um resumo para o técnico e uma lista de informações a conferir com o contador sobre IBS/CBS. Exibir, ao final, o cartão: **“Próxima evolução: integração autorizada com a Unidade Digital Cocari e com outros sistemas por MCP.”**

## 5. Estrutura recomendada de 6 slides

1. **A dor:** “No campo, a dúvida chega antes da resposta.” Mostrar o produtor enfrentando dúvidas técnicas, financeiras e tributárias.
2. **A solução:** WhatsApp como porta de entrada: perguntas em linguagem natural e informações contextualizadas.
3. **O diferencial:** dados da safra + cálculos confiáveis + fontes revisadas + pessoas responsáveis.
4. **A ponte com a cooperativa e o agro conectado:** Unidade Digital Cocari como exemplo; arquitetura MCP para integrar outros sistemas, com conectores e autorização.
5. **A demonstração:** uma conversa, uma simulação e um resumo compartilhável.
6. **A oportunidade:** piloto com produtores e especialistas; B2B2C como hipótese; chamada à validação.

## 6. Perguntas difíceis da banca — respostas curtas

**“Por que não usar o ChatGPT?”**  
Porque nosso produto não depende apenas de gerar texto: pretende manter dados estruturados da safra, executar cálculos auditáveis e conectar o cooperado aos serviços e profissionais da cooperativa, mediante integração e autorização. A proposta inclui interoperabilidade via MCP para conectar diferentes sistemas autorizados, sem ficar presa a um único aplicativo. Esse conjunto deve ser validado na prática.

**“Isso já existe?”**  
Existem assistentes agrícolas e plataformas com IA. Não reivindicamos pioneirismo no WhatsApp. Nossa proposta de valor é a **jornada integrada do cooperado**, especialmente ao combinar finanças, assistência técnica, dúvidas tributárias e conexão com sistemas existentes.

**“Vocês já estão integrados à Cocari?”**  
Não. A Unidade Digital é um exemplo concreto de plataforma com a qual o projeto **poderia** se integrar. Dependerá de parceria institucional, acesso técnico e consentimento dos cooperados.

**“O MCP permite conectar a qualquer aplicativo?”**  
Ele facilita a integração por um padrão comum, mas não dá acesso automático a sistemas. Cada aplicativo precisa oferecer MCP ou uma API/conector autorizado; também é necessário autenticação, permissões e, quando aplicável, acordo com o fornecedor.

**“Vocês já têm MCP funcionando?”**  
Ainda não. No material atual há uma base de integrações via API/webhook e n8n; a implementação de cliente e servidor MCP está no roadmap. No MVP, demonstraremos primeiro os cálculos e a conversa no WhatsApp.

**“A IA pode recomendar defensivos ou indicar o melhor regime tributário?”**  
Não de forma autônoma. Dúvidas de manejo que exigem diagnóstico são encaminhadas ao agrônomo; decisões tributárias individuais exigem validação pelo contador.

**“Como provar que o produtor vai usar?”**  
No piloto, mediremos conclusão das tarefas, compreensão dos cálculos, utilidade percebida, retorno ao agente e qualidade dos encaminhamentos, com produtores e profissionais reais.

## 7. Referências do projeto e fontes públicas

**Base conceitual do projeto:** *Agro na Medida — Proposta Ideathon* e evolução *Agro na Medida ZAP*, elaboradas para o desafio “Agro — produzir mais, com menos risco”, do Ideathon Mandaguari 2026.

**Cocari, fontes públicas consultadas em 10/11/2026:**

- [Unidade Digital Cocari — página oficial do aplicativo](https://lp.cocari.com.br/lancamento-aplicativo-cocari): lista recursos de safra, contratos, pedidos, contas, serviços e atendimento aos consultores.
- [Cocari — App do Produtor supera 4 mil cooperados cadastrados, 23/03/2026](https://www.cocari.com.br/informativo/app-do-produtor-cocari-amplia-adesao-e-ja-reune-mais-de-4-mil-cooperados-na-plataforma): descreve módulos agrícola, financeiro, insumos e contratos. **Este dado demonstra adesão ao aplicativo da Cocari, não usuários do nosso agente.**

**Premissas de governança:** LGPD, minimização de dados, autenticação, autorização e controle de acesso; indicação de fontes e datas; revisão técnica e contábil; integração somente com acordo e viabilidade comprovados.


## 8. Referências técnicas e nota de atualização — MCP

- [Model Context Protocol — visão geral da arquitetura](https://modelcontextprotocol.io/docs/learn/architecture): explica as funções de cliente, host e servidor MCP.
- [Model Context Protocol — ferramentas do servidor](https://modelcontextprotocol.io/specification/2026-07-28/server/tools): ferramentas que os servidores podem oferecer para consultar dados, chamar APIs e executar cálculos.
- [Model Context Protocol — autorização](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): padrões de autenticação e autorização para servidores remotos.

**Nota de versão:** o pitch anterior já abordava integração com a Unidade Digital Cocari por APIs e sistemas parceiros, mas **não mencionava o MCP**. Esta versão acrescenta o MCP como *estratégia futura de interoperabilidade*, sem alegar disponibilidade do recurso ou conexão universal a aplicativos.

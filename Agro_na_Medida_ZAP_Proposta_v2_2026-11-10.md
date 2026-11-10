# Agro na Medida ZAP
## Assistente inteligente do produtor rural pelo WhatsApp

**Proposta conceitual v2.0 | IdeaThon Mandaguari 2026 | 10/11/2026**  
**Status:** sugestão de evolução do Agro na Medida; ainda não aprovada ou validada com produtores.  
**Foco inicial:** pequenos produtores de soja e milho de Mandaguari, Paraná.

### 1. Resumo executivo

O **Agro na Medida ZAP** transforma o WhatsApp na porta de entrada para planejamento da safra, esclarecimento de dúvidas agronômicas gerais e orientação informativa sobre a reforma tributária. O produtor faz perguntas em linguagem natural, por mensagem de texto ou, em uma evolução, áudio; recebe explicações em linguagem simples, simulações calculadas com os dados que forneceu, fontes consultadas e um caminho de atendimento com técnico ou contador quando necessário.

**Promessa central:** *"Pergunte sobre sua safra pelo WhatsApp. Entenda riscos, números e próximos passos antes de decidir."*

O assistente **não prevê clima ou produtividade**, não substitui diagnóstico de um agrônomo e não escolhe automaticamente regime tributário. Distingue informação geral, simulação e recomendação profissional.

### 2. O problema e a oportunidade

O material do **Desafio Agro do IdeaThon Mandaguari 2026** pergunta como produzir mais com menos risco e ressalta as barreiras ao uso de dados de clima e solo, ao acesso a crédito e seguro rural, à compreensão da reforma tributária e à gestão de pequenas propriedades. A proposta anterior, **Agro na Medida**, busca responder: *"Quanto preciso colher e por qual preço preciso vender para cobrir meus custos?"*

Esta versão **não substitui** o Agro na Medida: acrescenta uma interface conversacional ao simulador e aos resumos já previstos, reduzindo a necessidade de navegar por formulários extensos. A hipótese de que o WhatsApp é o canal preferido precisa ser testada, não presumida como resultado de pesquisa.

### 3. Como o produtor usará

1. O produtor inicia conversa com o número oficial do projeto. A abertura explica que é um assistente digital, seu escopo e o tratamento de dados, e oferece opção de atendimento humano.
2. Pode perguntar livremente: *"Como melhorar minha soja?"*, *"Minha produção caiu 20%"*, *"O que mudou com o IBS e a CBS?"*.
3. A IA identifica se a pergunta diz respeito a **manejo e informação agronômica**, **finanças e risco da safra** ou **orientação tributária**, e solicita somente os dados indispensáveis.
4. Para cálculo, usa o **motor de simulação** do Agro na Medida, com premissas explicitadas; para conteúdo agronômico ou tributário, consulta uma **base de conhecimento revisada**, com fonte e data.
5. Retorna resposta curta e legível, podendo apresentar resumo para compartilhar com o técnico ou contador mediante autorização do produtor.
6. Quando não houver informação confiável suficiente, o sistema informa a limitação, pede contexto ou direciona ao profissional — sem inventar orientação.

### 4. Três frentes integradas

| Frente | Perguntas exemplares | Entrega proposta | Limite obrigatório |
| --- | --- | --- | --- |
| **Safra e manejo** | "Como melhorar a soja?", "O que observar depois da estiagem?" | Perguntas de triagem, checklist de observações, informações técnicas gerais referenciadas e encaminhamento ao agrônomo | Não diagnosticar doença nem prescrever insumos com base apenas em mensagem/foto |
| **Gestão e risco financeiro** | "Quanto preciso colher?", "Se perder 20%, quanto sobra?" | Área, custos, produtividade, preço; resultados estimados e ponto de equilíbrio | Não apresentar simulação como previsão nem resultado parcial como lucro líquido |
| **Reforma tributária** | "Como IBS/CBS me afetam?", "O que levar ao contador?" | Explicação geral em linguagem acessível, perfil informado, checklist e resumo | Não definir enquadramento, opção ou tributo devido sem análise profissional e regra atualizada |

O conteúdo técnico agronômico necessário para responder a dúvidas de manejo **não está presente nos dois PDFs de referência**. Precisará ser produzido ou selecionado de fontes técnicas confiáveis e revisado por agrônomo. A legislação tributária citada na proposta também exige controle de vigência e revisão contábil.

### 5. Conversas de exemplo para a demonstração

**Conversa A — Produtividade (triagem segura).**  
**Produtor:** "Minha soja está ficando amarela. Como posso melhorar a safra?"  
**Assistente:** "Posso ajudar você a organizar as informações para avaliar o problema. Em que fase está a soja? O amarelecimento aparece em toda a área ou em partes? Houve chuva intensa ou estiagem? Você tem análise recente do solo? Com esses dados, posso mostrar hipóteses gerais e cuidados de observação presentes em materiais técnicos revisados; para diagnóstico e indicação de produto, o ideal é consultar seu agrônomo."

**Conversa B — Simulação financeira com números fictícios.**  
**Produtor:** "Tenho 10 hectares, custo informado de R$ 45 mil, esperava 60 sacas por hectare a R$ 100. Se colher 20% menos, fico no prejuízo?"  
**Assistente:** "Com redução hipotética de 20%, seriam 48 sacas/ha, ou 480 sacas. A R$ 100/saca, a receita estimada seria R$ 48.000. Descontando apenas os R$ 45.000 de custos informados, sobrariam R$ 3.000. Para cobrir esses custos com 480 sacas, o preço de equilíbrio seria R$ 93,75/saca. É uma simulação, não uma previsão; custos variáveis ou gastos não informados podem mudar o resultado. Quer testar outro preço?"

**Conversa C — Reforma tributária.**  
**Produtor:** "A reforma tributária muda alguma coisa para mim?"  
**Assistente:** "A proposta considera regras de IBS e CBS relacionadas ao produtor rural, mas o efeito no seu caso depende da atividade e de dados que devem ser analisados pelo contador. Posso explicar termos gerais e montar um checklist. Sua receita anual aproximada já está organizada? Você trabalha como produtor integrado? Qual é o enquadramento informado pelo seu contador? Não escolherei um regime automaticamente; mostrarei a fonte e a data do conteúdo utilizado."

### 6. Arquitetura de integração sugerida

**WhatsApp Business Platform (API oficial)** → **recebimento de mensagens (webhook)** → **camada de identificação da intenção e proteção de dados** → um de três serviços: **motor matemático de simulação**, **busca de conteúdo técnico revisado** ou **base tributária versionada** → **resposta pelo WhatsApp**; em caso de necessidade, **encaminhamento autorizado a técnico ou contador**.

**Componentes mínimos:**
- Número comercial e integração oficial de testes; processamento de mensagens e registro básico de consentimento.
- Perfil mínimo opcional do produtor: cultura, município, área, safra, custos, produtividade e preço; dados tributários só quando pertinentes e autorizados.
- Motor de cálculo com fórmulas explícitas, regras para valores ausentes e marcação de premissas; resultados auditáveis.
- Biblioteca de perguntas e respostas aprovadas por técnico e contador, indicando *fonte, data de revisão e validade*; busca por trechos relevantes em vez de respostas sem sustentação.
- Registro de encaminhamento e possibilidade de falar com um responsável humano.

**Regras da plataforma:** a documentação oficial oferece números de teste e webhooks. Segundo a política de mensagens do WhatsApp Business consultada em 10/11/2026, respostas livres são admitidas dentro da janela de atendimento de 24 horas iniciada/renovada por mensagem do usuário; mensagens iniciadas fora dela exigem modelos aprovados, com preços e requisitos próprios. A regulação de assistentes de IA na plataforma deve ser reavaliada antes de lançamento comercial, inclusive à luz dos termos da Meta e da atuação do Cade no Brasil. Não usar automações não oficiais do aplicativo comum.

### 7. Escopo do MVP para o IdeaThon

**P0 — Demonstração do hackathon:**
1. Um fluxo de conversa em texto no WhatsApp (ou ambiente oficial de testes) que reconhece perguntas livres em três categorias.
2. Um exemplo de safra de soja ou milho, com dados fictícios, e cálculo correto de ponto de equilíbrio e perda hipotética de produtividade.
3. De oito a doze respostas curtas sobre perguntas frequentes agronômicas **somente após revisão técnica** e de dúvidas gerais sobre a reforma tributária **somente após revisão contábil**.
4. Fonte ou rótulo de conteúdo revisado, data de atualização, opção de obter resumo e mensagem de encaminhamento para profissional.
5. Demonstração das recusas adequadas: pergunta sem base, falta de dados, prescrição de defensivo e enquadramento tributário individual.

**P1 — Próximo piloto:** mensagens de voz com transcrição; foto como registro de observação para o técnico, sem diagnóstico automático; histórico de safras, lembretes solicitados e consentidos; integração com profissionais reais.

**P2 — Após validação:** uso de clima e solo com fonte e atualização conhecidas; integrações autorizadas com cooperativas, documentos fiscais e ferramentas técnicas; conteúdos para café e avicultura; atualização automatizada de normas acompanhada de revisão humana.

### 8. Governança e proteção do produtor

- Informar expressamente que o interlocutor é um assistente de IA e explicar os limites do serviço.
- Pedir consentimento aplicável e definir finalidade, retenção, acesso, correção e exclusão de dados conforme LGPD; evitar solicitar documentos sensíveis por padrão.
- Não utilizar conversas para treinamento de modelos de uso geral sem base legal e compatibilidade com termos da plataforma.
- Requerer revisão humana de conteúdo agronômico, legislação, exceções e vigências; citar fonte e data quando houver afirmação técnica/tributária.
- Nenhuma recomendação individual de defensivos, doses, adubação ou interpretação de foto sem profissional habilitado; nenhuma conclusão tributária automatizada personalizada.
- Deixar claro o que é dado informado pelo usuário, hipótese de cenário e informação externa. Oferecer contestação e atendimento humano.

### 9. Validação e modelo de negócio

Manter o grupo originalmente proposto: **5 produtores, 2 técnicos e 1 contador**. Verificar se os produtores conseguem formular suas próprias perguntas, entender o ponto de equilíbrio e reconhecer a diferença entre informação, simulação e recomendação profissional. Os técnicos avaliam relevância e segurança das respostas de safra; o contador avalia clareza e atualização do material tributário. Medir tempo para resposta útil, necessidade de ajuda, questões sem resposta aprovada e interesse em uso continuado. **Não há resultados de entrevistas ainda.**

**Hipótese comercial:** cooperativas contratam um serviço de atendimento e apoio à gestão disponibilizado aos cooperados, com supervisão técnica e contábil. Produtores são usuários; cooperativas são compradoras potenciais a entrevistar separadamente. Cocari, IDR-Paraná e escritórios contábeis são **potenciais** colaboradores, sem participação confirmada.

### 10. Pitch sugerido — 45 segundos

> "O pequeno produtor enfrenta decisões importantes, mas nem sempre tem tempo ou ferramentas para organizar custos, avaliar riscos e entender mudanças como a reforma tributária. E se ele pudesse começar pela ferramenta que já usa para conversar? O Agro na Medida ZAP leva um assistente especializado ao WhatsApp. O produtor pergunta sobre sua safra, simula perdas de produção e preços, entende o ponto de equilíbrio e encontra informações tributárias em linguagem simples, sempre com fontes e apoio de profissionais. Começamos com soja e milho em Mandaguari, validando o serviço com produtores, técnicos e contador. Nosso objetivo não é substituir o agrônomo nem o contador: é ajudar o produtor a chegar mais preparado para decidir."

### 11. Fontes e distinção entre evidência e hipótese

**Referências fornecidas pelo usuário:**
- *Desafios Ideathon Mandaguari 2026.pdf*, p. 1, Desafio Agro (contexto, necessidades e possíveis parceiros).
- *Agro_na_Medida_Proposta_Ideathon.pdf*, pp. 1–3 (pergunta central, simulador, frente tributária, MVP, teste com usuários e hipótese comercial).

**Referências externas de viabilidade técnica e política da plataforma, consultadas em 10/11/2026:**
- WhatsApp Business, Central do Desenvolvedor: https://whatsappbusiness.com/pt-br/developers/developer-hub/
- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/
- Cade, decisão sobre restrições a IA no WhatsApp (04/03/2026): https://www.gov.br/cade/pt-br/assuntos/noticias/tribunal-do-cade-mantem-medida-preventiva-sobre-novos-termos-de-uso-do-whatsapp

**Hipóteses ainda não comprovadas:** adoção maior por ser WhatsApp, benefício econômico, suficiência das fontes técnicas, aceitação do comprador, preço e possibilidade de automação extensa. O material do desafio e a proposta anterior sustentam **a existência das questões a investigar**, não a efetividade desta solução.

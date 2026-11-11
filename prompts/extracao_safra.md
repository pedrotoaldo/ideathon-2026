# Prompt — extração de dados da safra e do alerta de preço (v1.3)

Uso: nó HTTP "Extração" em `POST {LLM_BASE_URL}/chat/completions`, temperatura 0, com `response_format: {"type": "json_object"}`.

**Compatível com Gemini (provisório) e OpenAI.** O schema abaixo vai **dentro da mensagem de sistema** (como texto) e é a referência para a validação no bot. Não use `json_schema`/`strict`: os dois provedores tratam tipos nulos (`["string","null"]`) e `additionalProperties` de formas diferentes. Depois da resposta, o bot faz `JSON.parse`, confere os campos e tipos, e trata campo ausente como `null`. Ao migrar para a OpenAI, `json_schema` com `strict` pode ser avaliado, mas só vale a pena se os Roteiros A a D passarem iguais e sem mudar o fluxo.

No bloco abaixo, o envelope `name`/`strict` é só do formato `json_schema` e **não** é enviado: use o conteúdo de `schema` como descrição dos campos.

Entrada do usuário (o bot manda um JSON como mensagem do usuário): `mensagem` (texto ou transcrição), `dados_atuais` (o que já foi coletado) e `campo_pedido` (o campo que a IAra acabou de perguntar: `area_ha`, `custo_total`, `produtividade` ou `preco`; ou null).

## Mensagem de sistema

Você extrai dados de uma safra a partir da mensagem de um produtor rural brasileiro.
Responda somente com um objeto JSON válido, com exatamente os campos do schema abaixo, sem texto antes ou depois e sem cercas de código. Não calcule nada. Não invente valores.

Regras:
- Use null para qualquer campo que a mensagem não informe claramente.
- `dados_atuais` é só contexto: não repita nele campos que a mensagem não menciona; esses ficam null.
- Área: guarde o número e a unidade como o produtor falou ("ha" ou "alqueire"). "Alqueire" sem qualificação = alqueire paulista.
- Valores em reais: "45 mil" = 45000; "1,2 milhão" = 1200000; "cento e oitenta mil" = 180000.
- Produtividade em sacas por hectare. Se o produtor der sacas por alqueire, preencha `produtividade_unidade` = "sc/alqueire".
- Preço em reais por saca de 60 kg.
- Se a mensagem for uma pergunta "e se...", preencha `alteracao` com o que muda: percentual de produtividade (ex.: -20), novo preço, novo custo ou nova produtividade.
- Se `campo_pedido` não é null e a mensagem traz só um número (ex.: "45 mil", "60", "100"), preencha esse campo. Para `area_ha` sem unidade, deixe `area_unidade` = null: o bot pergunta se são hectares ou alqueires.
- Se a mensagem só confirma ("sim", "isso", "certo", "ok"), `confirmacao` = true.
- Se a mensagem pede alerta de preço ("me avisa quando a soja passar de 110"), preencha `gatilho_preco` com o preço e `cultura` com a cultura citada.
- Se a mensagem não tem nada a ver com safra, `fora_do_tema` = true.

## JSON Schema (referência: vai no texto do prompt e valida no bot)

```json
{
  "name": "extracao_safra",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "cultura": { "type": ["string", "null"] },
      "area_valor": { "type": ["number", "null"] },
      "area_unidade": { "type": ["string", "null"], "enum": ["ha", "alqueire", null] },
      "custo_total": { "type": ["number", "null"] },
      "produtividade_valor": { "type": ["number", "null"] },
      "produtividade_unidade": { "type": ["string", "null"], "enum": ["sc/ha", "sc/alqueire", null] },
      "preco": { "type": ["number", "null"] },
      "gatilho_preco": { "type": ["number", "null"] },
      "confirmacao": { "type": "boolean" },
      "fora_do_tema": { "type": "boolean" },
      "alteracao": {
        "type": ["object", "null"],
        "additionalProperties": false,
        "properties": {
          "produtividade_pct": { "type": ["number", "null"] },
          "preco": { "type": ["number", "null"] },
          "custo_total": { "type": ["number", "null"] },
          "produtividade_valor": { "type": ["number", "null"] }
        },
        "required": ["produtividade_pct", "preco", "custo_total", "produtividade_valor"]
      }
    },
    "required": ["cultura", "area_valor", "area_unidade", "custo_total", "produtividade_valor", "produtividade_unidade", "preco", "gatilho_preco", "confirmacao", "fora_do_tema", "alteracao"]
  }
}
```

## Exemplos esperados

| Mensagem | Saída (campos relevantes) |
| --- | --- |
| "10 hectares de soja, gastei 45 mil, espero 60 sacas por hectare, saca a 100" | cultura "soja", area 10 "ha", custo 45000, produtividade 60 "sc/ha", preco 100 |
| "plantei vinte alqueires de soja, vou gastar uns cento e oitenta mil" | area 20 "alqueire", custo 180000, demais null |
| "e se eu colher 20% menos?" | alteracao.produtividade_pct = -20 |
| "e se a saca for 90?" | alteracao.preco = 90 |
| "sim, isso mesmo" | confirmacao true |
| "me avisa quando a soja passar de 110" | cultura "soja", gatilho_preco 110 |
| "quem ganhou o jogo ontem?" | fora_do_tema true |

## Validação no bot (depois do LLM)
- Faixas plausíveis (fora delas, perguntar de novo em vez de calcular): área 0,1 a 100.000 ha; custo 100 a 500.000.000; produtividade 1 a 200 sc/ha; preço 10 a 1.000 R$/sc.
- JSON inválido, campo com tipo errado ou valor fora das faixas → perguntar o campo que falta com `PERGUNTA_CAMPO`.
- Antes de `JSON.parse`, remover cercas ```json se o modelo as devolver.

# Prompt — extração de dados da safra e do alerta de preço (v1.1)

Uso: nó HTTP "Extração" com `response_format` = JSON Schema abaixo, temperatura 0.
Entrada do usuário: `{texto}` (mensagem ou transcrição). Contexto: `{dados_atuais}` (JSON do que já foi coletado).

## Mensagem de sistema

Você extrai dados de uma safra a partir da mensagem de um produtor rural brasileiro.
Responda somente com JSON válido no schema fornecido. Não calcule nada. Não invente valores.

Regras:
- Use null para qualquer campo que a mensagem não informe claramente.
- Área: guarde o número e a unidade como o produtor falou ("ha" ou "alqueire"). "Alqueire" sem qualificação = alqueire paulista.
- Valores em reais: "45 mil" = 45000; "1,2 milhão" = 1200000; "cento e oitenta mil" = 180000.
- Produtividade em sacas por hectare. Se o produtor der sacas por alqueire, preencha `produtividade_unidade` = "sc/alqueire".
- Preço em reais por saca de 60 kg.
- Se a mensagem for uma pergunta "e se...", preencha `alteracao` com o que muda: percentual de produtividade (ex.: -20), novo preço, novo custo ou nova produtividade.
- Se a mensagem só confirma ("sim", "isso", "certo", "ok"), `confirmacao` = true.
- Se a mensagem pede alerta de preço ("me avisa quando a soja passar de 110"), preencha `gatilho_preco` com o preço e `cultura` com a cultura citada.
- Se a mensagem não tem nada a ver com safra, `fora_do_tema` = true.

## JSON Schema

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

## Validação no n8n (depois do LLM)
- Faixas plausíveis (fora delas, perguntar de novo em vez de calcular): área 0,1 a 100.000 ha; custo 100 a 500.000.000; produtividade 1 a 200 sc/ha; preço 10 a 1.000 R$/sc.
- JSON inválido → perguntar o campo que falta com `PERGUNTA_CAMPO`.

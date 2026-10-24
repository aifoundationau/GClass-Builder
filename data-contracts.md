# Data Contracts: AI Foundation GCourse Builder

## Invariant Rules
1. **Partition Key**: Every shared record carries `{ tag, businessId, businessName, source }`.
2. **Strict Integers for Tokens**: Token balances and quantities are non-negative whole integers (`Math.round`, no decimals).
3. **Cents for Token Prices**: Token unit prices keep 2 decimal places (e.g. `USD $1.00`, `AUD $1.43`).
4. **Additional Properties**: All JSON / Zod schemas strictly enforce `additionalProperties: false`.
5. **Australian Privacy Act**: No sensitive user PII stored in public or unencrypted logs.

---

## 1. Domain: Token Pricing Settings (SuperAdmin)

### Firestore Path
`system_settings/aifoundation_service_prices`

### Schema (`PUT /api/tokens/pricing-settings`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["usd"],
  "properties": {
    "usd": {
      "type": "number",
      "minimum": 0.01,
      "maximum": 1000000,
      "description": "Baseline price per token in USD (keeps up to 2 decimal places)."
    },
    "aud": {
      "type": ["number", "null"],
      "minimum": 0.01,
      "maximum": 1000000,
      "description": "Optional explicit price per token in AUD; if null or omitted, auto-converted via live exchange rate."
    }
  }
}
```

### Schema (`GET /api/tokens/pricing-settings`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["usd", "aud", "convertedAud", "exchangeRate", "updatedAt", "updatedBy"],
  "properties": {
    "usd": { "type": "number", "minimum": 0.01, "maximum": 1000000 },
    "aud": { "type": ["number", "null"], "minimum": 0.01, "maximum": 1000000 },
    "convertedAud": { "type": ["number", "null"] },
    "exchangeRate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["rate", "date", "source"],
      "properties": {
        "rate": { "type": "number", "minimum": 0.5, "maximum": 5.0 },
        "date": { "type": "string" },
        "source": { "type": "string" }
      }
    },
    "updatedAt": { "type": ["string", "null"] },
    "updatedBy": { "type": ["string", "null"] }
  }
}
```

---

## 2. Domain: Tokens Balance & Checkout API

### Schema (`GET /api/tokens`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["balance", "hasProfile", "price", "priceUsd", "priceAud", "exchangeRate", "limits", "minPayment", "maxPayment", "canPay", "isSuperAdmin"],
  "properties": {
    "balance": { "type": ["integer", "null"], "minimum": 0 },
    "hasProfile": { "type": ["boolean", "null"] },
    "price": {
      "type": "object",
      "additionalProperties": false,
      "required": ["currency", "amount"],
      "properties": {
        "currency": { "type": "string", "enum": ["USD", "AUD"] },
        "amount": { "type": "number", "minimum": 0.01 }
      }
    },
    "priceUsd": {
      "type": "object",
      "additionalProperties": false,
      "required": ["currency", "amount"],
      "properties": {
        "currency": { "type": "string", "enum": ["USD"] },
        "amount": { "type": "number", "minimum": 0.01 }
      }
    },
    "priceAud": {
      "type": "object",
      "additionalProperties": false,
      "required": ["currency", "amount"],
      "properties": {
        "currency": { "type": "string", "enum": ["AUD"] },
        "amount": { "type": "number", "minimum": 0.01 }
      }
    },
    "exchangeRate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["rate", "date"],
      "properties": {
        "rate": { "type": "number" },
        "date": { "type": "string" }
      }
    },
    "limits": {
      "type": "object",
      "additionalProperties": false,
      "required": ["min", "max", "step", "pricedPer"],
      "properties": {
        "min": { "type": "integer" },
        "max": { "type": "integer" },
        "step": { "type": "integer" },
        "pricedPer": { "type": "integer" }
      }
    },
    "minPayment": { "type": "number" },
    "maxPayment": { "type": "number" },
    "canPay": { "type": "boolean" },
    "isSuperAdmin": { "type": "boolean" }
  }
}
```

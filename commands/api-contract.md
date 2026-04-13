# API Contract Generator

Generate OpenAPI/Swagger documentation from existing code, or validate contracts between services.

## Context
$ARGUMENTS

## Instructions

### Mode 1 — Generate Contract (default)

1. **Scan the project** for API endpoints:
   - **Go**: look for `router.GET/POST/PUT/DELETE`, `http.HandleFunc`, chi/gin/echo routes
   - **.NET**: look for `[HttpGet]`, `[HttpPost]`, `[Route]`, Controller classes
   - Read request/response DTOs, models, and validation rules

2. **For each endpoint, extract:**
   - HTTP method and path (with path parameters)
   - Request body schema (fields, types, required, validation rules)
   - Response body schema (fields, types, nullable)
   - Status codes (200, 201, 400, 404, 500)
   - Authentication requirements (Bearer, API key)
   - Query parameters and headers

3. **Generate OpenAPI 3.0 spec** in YAML:

```yaml
openapi: 3.0.3
info:
  title: {service-name} API
  version: 1.0.0
  description: {description}
servers:
  - url: http://localhost:{port}
    description: Local development
  - url: https://{service}.qa.gruponc.net.br
    description: QA environment
paths:
  /api/{resource}:
    get:
      summary: ...
      tags: [...]
      security:
        - bearerAuth: []
      parameters: [...]
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/...'
components:
  schemas:
    {Model}:
      type: object
      required: [field1, field2]
      properties:
        field1:
          type: string
          description: ...
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

4. **Save** as `docs/openapi.yaml` in the project

### Mode 2 — Cross-Service Contract Validation

If the user specifies two services (e.g., `/api-contract estoque vs localidade`):

1. Find the HTTP client in service A that calls service B
2. Find the actual endpoint in service B
3. Compare:
   - Request fields match what the client sends
   - Response fields match what the client expects
   - Types are compatible (UUID vs string, int vs int64)
   - Nullable fields handled correctly

4. Generate a **Contract Compatibility Report**:

```markdown
## Contract Validation: {Service A} → {Service B}

### Endpoint: GET /v1/localidade/distribuidores/elegiveis

| Field | Client expects | Server returns | Compatible |
|-------|---------------|----------------|------------|
| cnpj | string | string | YES |
| nome | string | string | YES |
| pdvAtivoIntegracao | bool | bool | YES |
| newField | - | string | WARN: client ignores |
| removedField | string | - | BREAK: client expects |

### Verdict: {COMPATIBLE | WARNING | BREAKING}
```

### Mode 3 — Generate Postman Collection

If the user asks for Postman:
1. Generate a Postman Collection v2.1 JSON
2. Include environment variables for base URLs
3. Add example request bodies
4. Save as `docs/postman_collection.json`

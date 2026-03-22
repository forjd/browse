# Plan 15: API Contract Testing from the Browser

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** API Developer, QA Engineer
**New commands:** `api-assert`

---

## Problem

`network` shows failed requests and `intercept` can mock them, but there's no way to validate API contracts from the browser's perspective: response schema validation, timing assertions, status code verification, and payload size checks. This bridges UI testing and API testing in one tool.

## Design

### Command Interface

```bash
# Assert on the next matching API request
browse api-assert /api/users --status 200 --schema users.schema.json

# Assert on timing
browse api-assert /api/dashboard --timing "<500ms"

# Assert on response body content
browse api-assert /api/users --body-contains '"role":"admin"'

# Assert on response size
browse api-assert /api/export --max-size 1mb

# Assert on headers
browse api-assert /api/data --header "content-type: application/json"

# Wait for a specific request (useful after click actions)
browse api-assert /api/submit --method POST --status 201 --timeout 10000

# Multiple assertions
browse api-assert /api/users \
  --status 200 \
  --schema users.schema.json \
  --timing "<1000ms" \
  --header "cache-control: *"

# JSON output for CI
browse api-assert /api/users --status 200 --json
```

### Flags

| Flag | Description |
|------|-------------|
| `--status <code>` | Expected HTTP status code |
| `--method <method>` | Match only this HTTP method (GET, POST, etc.) |
| `--schema <path>` | JSON Schema file to validate response body |
| `--timing "<Nms"` | Max response time |
| `--body-contains <string>` | Response body must contain string |
| `--body-not-contains <string>` | Response body must not contain string |
| `--max-size <size>` | Max response size (e.g., `500kb`, `1mb`) |
| `--min-size <size>` | Min response size |
| `--header <header: value>` | Expected response header (supports `*` wildcard) |
| `--timeout <ms>` | How long to wait for matching request |

### How It Works

1. Register a network request listener for the URL pattern
2. Wait for a matching request/response pair (or timeout)
3. Run all assertions against the captured response
4. Report pass/fail for each assertion

### Implementation

**File:** `src/commands/api-assert.ts` (~300 lines)

1. **Request Capture**:
   - Use `page.on('response', ...)` to intercept matching responses
   - Match by URL substring (same as `intercept` pattern matching)
   - Optionally filter by HTTP method
   - Capture: status, headers, body, timing, size

2. **Schema Validation**:
   - Parse JSON response body
   - Validate against JSON Schema file using a lightweight validator
   - Report which schema rules failed and where

3. **Timing Assertion**:
   - Use Playwright's `response.timing()` or calculate from request start to response end
   - Compare against threshold

4. **Size Assertion**:
   - Use `response.body().length` or `content-length` header
   - Parse size strings: `500kb` → 512000 bytes

5. **Header Assertion**:
   - Check response headers for expected values
   - Support wildcard matching (`cache-control: *` = just check presence)

### JSON Schema Validation

For the `--schema` flag, implement a minimal JSON Schema Draft 7 validator (~200 lines) supporting:
- `type` (string, number, boolean, object, array, null)
- `properties`, `required`
- `items` (for arrays)
- `enum`
- `pattern` (regex for strings)
- `minimum`, `maximum` (for numbers)

Alternatively, use `ajv` if it's worth the dependency.

### Output

```
API Assert: POST /api/users → 201 Created (234ms)
  ✓ Status: 201 (expected 201)
  ✓ Timing: 234ms (budget: <500ms)
  ✓ Schema: valid against users.schema.json
  ✗ Header: content-type — expected "application/json", got "text/html"
  ✓ Body contains: "role":"admin"

Result: 4/5 assertions passed
```

### Integration with Flows

```json
{
  "steps": [
    { "fill": { "name": "Test User", "email": "test@example.com" } },
    { "click": "Submit" },
    { "api-assert": {
        "url": "/api/users",
        "method": "POST",
        "status": 201,
        "timing": "<500ms"
      }
    }
  ]
}
```

## Testing

**File:** `test/api-assert.test.ts`

- Test URL pattern matching
- Test status code assertion
- Test timing assertion
- Test schema validation (valid and invalid responses)
- Test header assertion with wildcards
- Test body contains/not-contains
- Test size assertions
- Test timeout behavior

## Dependencies

- Consider `ajv` for JSON Schema validation (or implement minimal subset)

## Estimated Scope

- `src/commands/api-assert.ts` — ~300 lines
- `src/schema-validator.ts` — ~200 lines (if not using ajv)
- `test/api-assert.test.ts` — ~250 lines
- Help, protocol, daemon wiring — ~50 lines

# Plan 13: Active Security Scanning

**Priority:** Tier 3 — Lower Impact / Niche
**Personas:** Security Researcher, Pentester
**New sub-commands:** `security scan`

---

## Problem

The existing `security` command is passive — it checks headers, cookie flags, and mixed content. Security researchers want active probing: XSS input fuzzing, open redirect testing, clickjacking verification, and CSP bypass detection. This requires actually submitting payloads and observing behavior.

## Design

### Command Interface

```bash
# Run all active scans
browse security scan [url]

# Run specific scan types
browse security scan --checks xss,redirect,clickjack

# Target specific forms
browse security scan --forms

# JSON output
browse security scan --json

# Verbose — show every payload tested
browse security scan --verbose
```

### Scan Types

#### 1. Reflected XSS Probe (`xss`)

**Method:**
1. Snapshot the page for all input fields
2. For each text input, submit a set of canary payloads:
   - `<script>alert('xss')</script>`
   - `"><img src=x onerror=alert(1)>`
   - `javascript:alert(1)`
   - `{{constructor.constructor('alert(1)')()}}`
3. After submission, check if the canary appears unescaped in the page source
4. Listen for `dialog` events (indicates script execution)
5. Check `page.evaluate(() => document.querySelector('img[src="x"]'))` for DOM injection

**Output:**
```
XSS Scan:
  Form: /search (GET)
    ✗ Input "q": reflected XSS — payload appeared unescaped in response
      Payload: "><img src=x onerror=alert(1)>
      Location: <div class="results">..."><img src=x onerror=alert(1)>...</div>
  Form: /contact (POST)
    ✓ Input "name": properly escaped
    ✓ Input "email": properly escaped
    ✓ Input "message": properly escaped
```

#### 2. Open Redirect Detection (`redirect`)

**Method:**
1. Find all URL parameters in the current page URL and links
2. For each, substitute with external redirect targets:
   - `https://evil.example.com`
   - `//evil.example.com`
   - `/\evil.example.com`
3. Navigate and check if the browser ends up on an external domain
4. Also check `window.location` via `page.evaluate()`

#### 3. Clickjacking Test (`clickjack`)

**Method:**
1. Check `X-Frame-Options` header (already in passive scan)
2. Check CSP `frame-ancestors` directive
3. Actually attempt to load the page in an iframe:
   - Create a new page with an iframe pointing to the target
   - Check if the iframe loaded successfully
   - If yes and no frame-busting: vulnerable

#### 4. CSP Bypass Detection (`csp`)

**Method:**
1. Parse the CSP header
2. Check for known weak patterns:
   - `unsafe-inline` in `script-src`
   - `unsafe-eval` in `script-src`
   - Wildcard `*` in `script-src` or `default-src`
   - `data:` URI in `script-src`
   - Known CSP bypass endpoints (JSONP endpoints on whitelisted domains)
3. Attempt to inject a script via `page.evaluate()` and check if CSP blocks it

#### 5. Form Security (`forms`)

**Method:**
1. Find all forms on the page
2. Check each for:
   - CSRF token present (hidden field or header)
   - Form action uses HTTPS
   - Autocomplete attributes on sensitive fields
   - Password fields have `autocomplete="new-password"` or `autocomplete="current-password"`

### Safety

- **All scans are read-only or use isolated test data** — no destructive payloads
- **XSS probes use detection canaries, not actual exploit payloads**
- **Requires explicit `security scan` invocation** — never runs automatically
- **Authorization context**: Print warning: "This scan submits test payloads to forms. Only run against applications you have permission to test."

### Implementation

**File:** `src/commands/security.ts` — extend existing (add ~150 lines for dispatch)
**File:** `src/security-scanner.ts` (~500 lines)

1. **ScanEngine**:
   - Dispatches to individual scan modules
   - Collects results
   - Formats output

2. **XSSScanner**: form discovery, payload injection, reflection detection
3. **RedirectScanner**: URL parameter discovery, redirect testing
4. **ClickjackScanner**: iframe embedding test
5. **CSPScanner**: header parsing, weakness detection
6. **FormSecurityScanner**: CSRF, HTTPS, autocomplete checks

### Output (JSON)

```json
{
  "url": "https://example.com",
  "scans": {
    "xss": { "status": "fail", "findings": [...] },
    "redirect": { "status": "pass", "findings": [] },
    "clickjack": { "status": "warn", "findings": [...] },
    "csp": { "status": "fail", "findings": [...] },
    "forms": { "status": "pass", "findings": [] }
  },
  "summary": { "pass": 2, "warn": 1, "fail": 2 }
}
```

## Testing

**File:** `test/security-scanner.test.ts`

- Test XSS canary detection with mock pages
- Test open redirect detection
- Test clickjacking iframe test
- Test CSP header parsing and weakness detection
- Test form security checks

## Dependencies

- No new dependencies

## Estimated Scope

- `src/security-scanner.ts` — ~500 lines
- Extensions to `src/commands/security.ts` — ~150 lines
- `test/security-scanner.test.ts` — ~300 lines
- Help text updates — ~40 lines

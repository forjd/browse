# Plan 12: Cookie Consent & Privacy Compliance Audit

**Priority:** Tier 2 — Medium Impact
**Personas:** Compliance Officer, Freelancer
**New commands:** `compliance`

---

## Problem

The `cookies` command lists cookies and `security` checks cookie flags, but neither performs compliance-level analysis. GDPR/ePrivacy requires: no tracking cookies before consent, visible cookie banner, third-party tracker identification, and consent mechanism validation. There's no automated way to check this.

## Design

### Command Interface

```bash
# Full compliance audit
browse compliance [url]

# Specific standard
browse compliance --standard gdpr
browse compliance --standard ccpa
browse compliance --standard eprivacy

# JSON output
browse compliance --json

# Check specific areas
browse compliance --check cookies,trackers,consent-banner
```

### Audit Checks

#### 1. Pre-Consent Cookie Audit
The core GDPR test: what cookies are set before the user interacts with any consent banner?

**Method:**
1. Clear all cookies and storage (`wipe`)
2. Navigate to URL
3. Wait for page load (but do NOT interact with anything)
4. Capture all cookies → these are "pre-consent cookies"
5. Classify each:
   - **Essential** (likely OK): session IDs, CSRF tokens, language preference
   - **Analytics** (violation): `_ga`, `_gid`, `_fbp`, `_hjid`, etc.
   - **Advertising** (violation): `_gcl_*`, `fr`, `IDE`, etc.
   - **Unknown**: flag for manual review

Known tracker cookie patterns (built-in database):
```
_ga, _gid, _gat          → Google Analytics
_fbp, _fbc                → Facebook Pixel
_hjid, _hjFirstSeen       → Hotjar
_uetsid, _uetvid          → Microsoft Ads
IDE, DSID, 1P_JAR         → Google Ads / DoubleClick
```

#### 2. Consent Banner Detection
- Look for common consent banner patterns:
  - Elements with text: "cookie", "consent", "privacy", "accept", "reject"
  - Common banner libraries: OneTrust, Cookiebot, CookieYes, Osano
  - ARIA roles: `dialog`, `alertdialog` with cookie-related content
- Check that banner is visible and prominent
- Check for "reject all" option (GDPR requires equal prominence)

#### 3. Third-Party Tracker Detection
- Analyze network requests for known tracking domains:
  - `google-analytics.com`, `googletagmanager.com`
  - `facebook.net`, `connect.facebook.net`
  - `hotjar.com`, `clarity.ms`
  - `doubleclick.net`, `googlesyndication.com`
- Detect tracking scripts loaded before consent
- Count third-party requests by category

#### 4. Post-Consent Verification
- If consent banner detected, click "accept all"
- Check which new cookies are set
- Verify they match what's disclosed in the cookie policy

#### 5. Privacy Policy Link
- Check for visible privacy policy link
- Check for cookie policy link
- Verify links are not broken (200 response)

### Output Format

```
Privacy Compliance Audit: https://example.com
Standard: GDPR / ePrivacy
═══════════════════════════════════════════════

Pre-Consent Cookies (set before user interaction):
  ✗ _ga (Google Analytics) — VIOLATION: analytics cookie before consent
  ✗ _fbp (Facebook Pixel) — VIOLATION: advertising cookie before consent
  ✓ session_id — Essential (likely session cookie)
  ✓ lang — Essential (language preference)
  Total: 4 cookies, 2 violations

Consent Banner:
  ✓ Cookie consent banner detected (OneTrust)
  ✓ "Accept All" button present
  ✗ "Reject All" button not found — VIOLATION: must offer equal reject option
  ✓ Banner appears on first visit

Third-Party Trackers (loaded before consent):
  ✗ google-analytics.com — Analytics (2 requests)
  ✗ connect.facebook.net — Advertising (1 request)
  ✓ fonts.googleapis.com — Functional (not a tracker)
  Total: 3 tracker requests before consent — VIOLATION

Privacy Policy:
  ✓ Privacy policy link found: /privacy
  ✓ Cookie policy link found: /cookies
  ✓ Both links accessible (200 OK)

Summary: 4 violations found
  - 2 tracking cookies set before consent
  - 1 missing "Reject All" button
  - 3 tracker network requests before consent
```

### Implementation

**File:** `src/commands/compliance.ts` (~250 lines)
**File:** `src/compliance-engine.ts` (~400 lines)
**File:** `src/tracker-database.ts` (~100 lines, known cookie/domain patterns)

1. **Pre-consent audit**:
   - Call `wipe` to clear state
   - Navigate to URL
   - Wait for `network-idle`
   - Get cookies via `context.cookies()`
   - Classify using tracker database

2. **Consent banner detection**:
   - Use `page.evaluate()` to search for consent-related elements
   - Check for known banner library markers (OneTrust: `#onetrust-banner-sdk`, Cookiebot: `#CybotCookiebotDialog`)
   - Fall back to text-matching on visible dialog-like elements

3. **Tracker detection**:
   - Use network buffer (already captured) to find third-party requests
   - Match against known tracking domains
   - Classify by category (analytics, advertising, social, functional)

4. **Scoring**:
   - Each violation is a fail
   - Each check passes or fails
   - No numeric score — pass/fail per check (compliance is binary)

## Testing

**File:** `test/compliance.test.ts`

- Test cookie classification against known patterns
- Test consent banner detection with mock HTML
- Test tracker domain matching
- Test pre-consent vs post-consent flow
- Test output formatting

## Dependencies

- No new dependencies
- Tracker database is a static map (no external API calls)

## Estimated Scope

- `src/commands/compliance.ts` — ~250 lines
- `src/compliance-engine.ts` — ~400 lines
- `src/tracker-database.ts` — ~100 lines
- `test/compliance.test.ts` — ~250 lines
- Help, protocol, daemon wiring — ~50 lines

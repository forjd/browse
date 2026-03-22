# Plan 08: SEO Audit

**Priority:** Tier 2 — Medium Impact
**Personas:** SEO Specialist, Freelancer
**New commands:** `seo`

---

## Problem

`extract meta` pulls Open Graph and Twitter Card data, but there's no holistic SEO audit. SEO specialists need: canonical URL validation, robots directives, structured data (Schema.org) validation, heading hierarchy, image alt text coverage, and internal link analysis — all in one report.

## Design

### Command Interface

```bash
# Full SEO audit of current page
browse seo

# Audit a specific URL
browse seo https://example.com/blog/my-post

# JSON output
browse seo --json

# Check specific categories only
browse seo --check meta,headings,images

# Audit with scoring
browse seo --score
```

### Audit Categories

#### 1. Meta Tags (`meta`)
- `<title>` — present, length (50-60 chars optimal)
- `<meta name="description">` — present, length (150-160 chars)
- `<meta name="robots">` — directives (index, follow, noindex, nofollow)
- `<link rel="canonical">` — present, matches current URL, no self-referencing issues
- `<meta name="viewport">` — present and correct for mobile

#### 2. Open Graph & Social (`social`)
- `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- Image URL accessibility (does `og:image` return 200?)

#### 3. Heading Hierarchy (`headings`)
- Exactly one `<h1>` per page
- Heading levels don't skip (h1 → h3 without h2 = warning)
- H1 content matches or relates to `<title>`
- Heading outline visualization

#### 4. Images (`images`)
- Total image count
- Images missing `alt` attribute (count + list)
- Images with empty `alt=""` (decorative — OK but flag)
- Large images without `width`/`height` (CLS risk)
- Images without `loading="lazy"` below the fold

#### 5. Links (`links`)
- Internal link count
- External link count
- Links without descriptive text ("click here", "read more")
- Links with `rel="nofollow"` audit
- Broken link detection (optional, via HEAD requests)

#### 6. Structured Data (`structured-data`)
- JSON-LD scripts — parse and validate against Schema.org types
- Microdata detection
- RDFa detection
- Common schema types: Article, Product, BreadcrumbList, Organization, FAQ

#### 7. Technical SEO (`technical`)
- Page load time (from existing perf metrics)
- Mobile-friendliness (viewport meta + responsive indicators)
- HTTPS check
- Language attribute (`<html lang="en">`)
- Hreflang tags for internationalized content

### Output Format

```
SEO Audit: https://example.com/blog/my-post
═══════════════════════════════════════════

Meta Tags
  ✓ Title: "My Blog Post Title" (22 chars — OK)
  ✓ Description: "A detailed description..." (148 chars — OK)
  ✓ Canonical: https://example.com/blog/my-post
  ✗ Viewport meta tag missing

Headings
  ✓ Single H1: "My Blog Post Title"
  ⚠ Heading skip: H1 → H3 (missing H2)
  Outline:
    H1: My Blog Post Title
      H3: Introduction     ← skipped H2
      H3: Details
        H4: Sub-detail

Images
  ✓ 12 images found
  ✗ 3 images missing alt text
    - /images/hero.jpg
    - /images/chart-1.png
    - /images/photo-2.jpg
  ⚠ 5 images missing width/height attributes

Links
  ✓ 24 internal links
  ✓ 8 external links
  ⚠ 2 links with generic text ("click here", "read more")

Structured Data
  ✓ JSON-LD: Article (schema.org/Article)
  ✓ JSON-LD: BreadcrumbList

Score: 78/100
```

### Implementation

**File:** `src/commands/seo.ts` (~400 lines)

1. Navigate to URL if provided (or use current page)
2. Run all audit functions via `page.evaluate()`:
   - Extract all `<meta>`, `<link>`, `<h1>`-`<h6>`, `<img>`, `<a>`, `<script type="application/ld+json">`
   - Return structured data to Node
3. Score each category:
   - Pass (2 pts), Warning (1 pt), Fail (0 pts)
   - Normalize to 0-100 scale
4. Format output (text or JSON)

### Integration with Flows

```json
{
  "steps": [
    { "goto": "{{base_url}}/blog/my-post" },
    { "seo": { "minScore": 80 } }
  ]
}
```

Flow step fails if score is below `minScore`.

## Testing

**File:** `test/seo.test.ts`

- Mock pages with various SEO issues
- Test each audit category independently
- Test scoring calculation
- Test JSON output format
- Test flow step integration

## Dependencies

- No new dependencies — all analysis via `page.evaluate()`

## Estimated Scope

- `src/commands/seo.ts` — ~400 lines
- `test/seo.test.ts` — ~300 lines
- Help, protocol, daemon wiring — ~50 lines

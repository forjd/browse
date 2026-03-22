# Plan 02: Crawl Pipeline

**Priority:** Tier 1 — High Impact
**Personas:** Data Scientist, SEO Specialist, Freelancer
**New commands:** `crawl`

---

## Problem

`extract table`, `extract links`, and `text` are all single-page, one-shot commands. Users who need to scrape structured data across multiple pages must manually orchestrate navigation, pagination, and data collection. There's no way to follow links, respect rate limits, or output streaming results.

## Design

### Command Interface

```bash
# Basic crawl — extract from all pages within depth
browse crawl https://example.com \
  --depth 2 \
  --extract table \
  --output data.jsonl

# Crawl with pagination detection
browse crawl https://example.com/products \
  --paginate "next" \
  --max-pages 50 \
  --extract "select .product-card --attr data-price" \
  --rate-limit 1/s \
  --output products.jsonl

# Crawl with link filtering
browse crawl https://example.com \
  --depth 3 \
  --include "/blog/*" \
  --exclude "*/tag/*" \
  --extract meta \
  --output blog-meta.jsonl

# Respect robots.txt
browse crawl https://example.com --depth 2 --robots

# Dry run — show what would be crawled
browse crawl https://example.com --depth 2 --dry-run

# JSON output for programmatic use
browse crawl https://example.com --depth 1 --extract links --json
```

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--depth <n>` | Max link-follow depth from start URL | `1` |
| `--paginate <selector\|text>` | CSS selector or accessible name of "next page" element | none |
| `--max-pages <n>` | Max pages when paginating | `100` |
| `--extract <type>` | What to extract: `table`, `links`, `meta`, `text`, `select <sel>` | `text` |
| `--rate-limit <n/s>` | Max requests per second | unlimited |
| `--output <path>` | Output file (`.jsonl`, `.csv`, `.json`) | stdout |
| `--include <pattern>` | Only follow URLs matching glob | `*` |
| `--exclude <pattern>` | Skip URLs matching glob | none |
| `--robots` | Respect robots.txt | `false` |
| `--dry-run` | List URLs that would be visited | `false` |
| `--json` | JSON output to stdout | `false` |
| `--same-origin` | Only follow same-origin links | `true` |
| `--timeout <ms>` | Per-page timeout | `30000` |

### Architecture

```
┌─ CrawlEngine ──────────────────────────────────┐
│                                                  │
│  URLFrontier (priority queue + dedup set)        │
│       │                                          │
│       ▼                                          │
│  RateLimiter (token bucket, configurable)        │
│       │                                          │
│       ▼                                          │
│  PageProcessor                                   │
│  ├─ Navigate to URL                              │
│  ├─ Wait for network idle                        │
│  ├─ Run extraction (reuse extract.ts handlers)   │
│  ├─ Discover links (if depth remaining)          │
│  └─ Emit result to output stream                 │
│       │                                          │
│       ▼                                          │
│  OutputWriter (JSONL / CSV / JSON)               │
└──────────────────────────────────────────────────┘
```

### Implementation

**File:** `src/commands/crawl.ts` — command handler (~100 lines)
**File:** `src/crawl-engine.ts` — core engine (~400 lines)

1. **URLFrontier**:
   - Priority queue ordered by depth (BFS)
   - Set of visited URLs (normalized — strip fragments, trailing slashes)
   - Include/exclude glob filtering via `safe-pattern.ts`
   - Optional robots.txt parsing (fetch `/robots.txt`, parse `Disallow` rules)

2. **RateLimiter**:
   - Simple token-bucket: track last request time, sleep if needed
   - Parse `n/s` format from `--rate-limit` flag

3. **PageProcessor**:
   - Navigate using existing `goto` logic
   - Reuse `handleExtractTable`, `handleExtractLinks`, `handleExtractMeta`, `handleExtractSelect` from `src/commands/extract.ts`
   - After extraction, if depth remaining, call `extract links` to discover new URLs
   - Apply `--include` / `--exclude` filters to discovered URLs

4. **Pagination mode** (`--paginate`):
   - Instead of following all links, look for the pagination element
   - Click it, wait for navigation/network-idle, extract, repeat
   - Stop when: element not found, max-pages reached, or URL stops changing

5. **OutputWriter**:
   - JSONL: one JSON object per line, each with `{ url, depth, timestamp, data }`
   - CSV: flatten extracted data (only works with table extraction)
   - JSON: collect all results, write array at end
   - Streaming: write each result as it's collected (JSONL is ideal for this)

6. **Progress reporting**:
   - Print to stderr: `[3/47] Crawling https://example.com/page/3...`
   - On completion: `Done. 47 pages crawled, 1,203 rows extracted.`

### Output Format (JSONL)

```json
{"url":"https://example.com/products?page=1","depth":0,"timestamp":"2026-03-22T10:00:00Z","data":[{"name":"Widget","price":"$9.99"}]}
{"url":"https://example.com/products?page=2","depth":0,"timestamp":"2026-03-22T10:00:01Z","data":[{"name":"Gadget","price":"$19.99"}]}
```

### Error Handling

- Page load failures: log warning, continue to next URL
- Extraction failures: log warning, emit `{ url, error: "..." }` to output
- Rate limit responses (429): exponential backoff (2s, 4s, 8s), retry up to 3 times
- Timeout: skip page, log warning

## Testing

**File:** `test/crawl.test.ts`

- Test URLFrontier dedup and depth limiting
- Test include/exclude glob filtering
- Test rate limiter timing
- Test pagination mode with mock "next" button
- Test robots.txt parsing
- Test JSONL output format
- Integration test: spin up local server with linked pages, verify full crawl

## Dependencies

- No new dependencies — reuses existing extract handlers and page navigation
- Robots.txt parsing: ~50 lines of custom code (simple `Disallow` rule matching)

## Estimated Scope

- `src/commands/crawl.ts` — ~100 lines
- `src/crawl-engine.ts` — ~400 lines
- `test/crawl.test.ts` — ~250 lines
- Help, protocol, daemon wiring — ~50 lines

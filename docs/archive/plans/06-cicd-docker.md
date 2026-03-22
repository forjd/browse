# Plan 06: CI/CD & Docker

**Priority:** Tier 2 — Medium Impact
**Personas:** DevOps Engineer, QA Engineer, OSS Maintainer
**New commands:** `ci-init`
**New artifacts:** Dockerfile, GitHub Action, GitLab CI template

---

## Problem

Getting `browse` running in CI requires manually figuring out: Playwright browser installation, headless configuration, binary compilation, and proper exit codes. There's no prebuilt Docker image and no CI template to copy-paste.

## Design

### 1. Dockerfile

**File:** `Dockerfile`

```dockerfile
FROM oven/bun:1-debian AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN ./setup.sh

FROM mcr.microsoft.com/playwright:v1.51.0-noble
COPY --from=builder /app/dist/browse /usr/local/bin/browse
ENV BROWSE_HEADED=0
ENTRYPOINT ["browse"]
```

Key decisions:
- Multi-stage build: Bun for compilation, Playwright base for runtime (includes browsers)
- Published to `ghcr.io/forjd/browse:<version>` and `ghcr.io/forjd/browse:latest`
- ~500MB image (Playwright browsers are large; unavoidable)

### 2. GitHub Action

**File:** `.github/actions/browse/action.yml`

```yaml
name: 'Browse QA'
description: 'Run browse browser automation commands'
inputs:
  command:
    description: 'Browse command to run'
    required: true
  config:
    description: 'Path to browse.config.json'
    required: false
runs:
  using: 'docker'
  image: 'docker://ghcr.io/forjd/browse:latest'
  args:
    - ${{ inputs.command }}
```

Usage in workflows:
```yaml
jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: forjd/browse@v1
        with:
          command: healthcheck --reporter junit --out results.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-results
          path: results.xml
```

### 3. GitLab CI Template

**File:** `ci/gitlab-ci.yml`

```yaml
browse-qa:
  image: ghcr.io/forjd/browse:latest
  script:
    - browse healthcheck --reporter junit --out results.xml
  artifacts:
    reports:
      junit: results.xml
```

### 4. `browse ci-init` Command

Scaffolds CI configuration for the current project.

```bash
# Interactive — asks which CI system
browse ci-init

# Explicit
browse ci-init --ci github
browse ci-init --ci gitlab
browse ci-init --ci circleci
```

**Output:** Writes a CI config file to the appropriate location and prints setup instructions.

### Implementation

**File:** `src/commands/ci-init.ts` (~200 lines)

1. Detect CI system (or accept `--ci` flag):
   - Check for `.github/`, `.gitlab-ci.yml`, `.circleci/`
   - Prompt if ambiguous

2. Generate config file from embedded templates:
   - GitHub: `.github/workflows/browse-qa.yml`
   - GitLab: append to `.gitlab-ci.yml`
   - CircleCI: `.circleci/config.yml` snippet

3. Check for `browse.config.json`, suggest creating one if missing

4. Print next steps:
   ```
   ✓ Created .github/workflows/browse-qa.yml

   Next steps:
   1. Set environment variables in GitHub Settings → Secrets:
      - STAGING_USER, STAGING_PASS (if using login)
      - ANTHROPIC_API_KEY (if using assert-ai)
   2. Configure browse.config.json with your environments and flows
   3. Push to trigger the workflow
   ```

### 5. Docker Image Publishing (CI)

**File:** `.github/workflows/publish-docker.yml`

- Trigger: on tag push (`v*`)
- Build multi-platform: `linux/amd64`, `linux/arm64`
- Push to `ghcr.io/forjd/browse`
- Tag with version + `latest`

## Testing

**File:** `test/ci-init.test.ts`

- Test CI system detection
- Test template generation for each CI system
- Test `browse.config.json` detection
- Verify generated YAML is valid

## Estimated Scope

- `Dockerfile` — ~20 lines
- `.github/actions/browse/action.yml` — ~20 lines
- `ci/gitlab-ci.yml` — ~15 lines
- `src/commands/ci-init.ts` — ~200 lines
- `.github/workflows/publish-docker.yml` — ~60 lines
- `test/ci-init.test.ts` — ~100 lines

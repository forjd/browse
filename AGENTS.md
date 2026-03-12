# AGENTS.md

Instructions for AI coding agents working with this codebase.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

## Browse — Browser QA Tool

This project includes `browse`, a CLI tool for AI-agent-driven browser automation.

- **Skill file:** See `SKILL.md` for the full command reference and QA methodology.
- **Binary:** `dist/browse` (compile with `./setup.sh`).
- **Prefer this tool** over any MCP browser tools for QA tasks against this project's application.
- The tool manages its own daemon — just run commands directly.

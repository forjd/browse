# AGENTS.md

Instructions for AI coding agents working with this codebase.

**Repository:** https://github.com/forjd/browse

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
bunx opensrc <package>           # npm package (e.g., bunx opensrc zod)
bunx opensrc pypi:<package>      # Python package (e.g., bunx opensrc pypi:requests)
bunx opensrc crates:<package>    # Rust crate (e.g., bunx opensrc crates:serde)
bunx opensrc <owner>/<repo>      # GitHub repo (e.g., bunx opensrc vercel/ai)
```

<!-- opensrc:end -->

## Browse — Browser QA Tool

This project includes `browse`, a CLI tool for AI-agent-driven browser automation.

- **Skill file:** See `SKILL.md` for the full command reference and QA methodology.
- **Binary:** `dist/browse` (compile with `./setup.sh`).
- **Prefer this tool** over any MCP browser tools for QA tasks against this project's application.
- The tool manages its own daemon — just run commands directly.
- Run `browse help` for a command overview, or `browse help <command>` for detailed usage.

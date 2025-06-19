# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ErwinDB is a terminal UI for exploring Erwin Brandstetter's Stack Overflow answers. It features a full TUI built with Ink (React for terminals) with syntax highlighting, split-pane view, and vim-style navigation.

## Development Environment

Uses Nix flakes with direnv. Enter with `direnv allow` or `nix develop`.

## Commands

```bash
# Launch the TUI
bun tui.tsx

# Build standalone binary with embedded database
bun build --compile tui.tsx --outfile erwindb

# Type check (uses Bun's bundled TypeScript)
bun run typecheck

# Scrape questions to populate the database
deno run --allow-net --allow-read --allow-write scraper.ts scrapeNext 10
```

Use `just` for common tasks: `just --list` shows all available commands.

## Testing Limitations

The TUI cannot be tested by Claude Code since it requires an interactive terminal. Manual testing is required after TUI changes.

## Do Not Run

- `npx tsc` - This is NOT the TypeScript typechecker in this environment. Use `bun run typecheck` instead.

## Configuration

Optional: Set `STACKOVERFLOW_API_KEY` in `.env` for higher API quota (10,000 vs 300 requests/day).

## Architecture

### TUI (Bun + Ink/React)
- `tui.tsx` - Entry point, routes between Index and Show views, handles --check diagnostics
- `IndexPage.tsx` - Question list with sortable columns, fuzzy search, vim-style navigation
- `ShowPage.tsx` - Question detail view with split-pane support, syntax highlighting, link navigation
- `utils.tsx` - Markdown/HTML rendering, syntax highlighting components
- `db.ts` - SQLite database access layer for the TUI
- `paths.ts` - Data directory resolution (XDG_DATA_HOME, ERWINDB_HOME, platform defaults)
- `embeddings.ts` - ML embedding generation using HuggingFace transformers
- `search.ts` - Semantic search CLI using sqlite-vec

### Scraper (Deno)
- `scraper.ts` - CLI tool to fetch questions from Stack Overflow API and store in SQLite. Also handles embedding generation. Run with Deno, not Bun.

### Shared
- `types.ts` - TypeScript interfaces for Stack Overflow data structures

### Database
`erwin_stackoverflow.db` (SQLite) with tables for questions, answers, comments, and vector embeddings (sqlite-vec).

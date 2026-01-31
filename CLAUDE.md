# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ErwinDB is a Rust TUI application for browsing Erwin Brandstetter's Stack Overflow Q&A content. It uses ratatui/crossterm for terminal rendering, rusqlite for database access, and nucleo for fuzzy search.

## Build Commands

```bash
cargo build              # Debug build
cargo build --release    # Optimized build
cargo run                # Run the application
cargo fmt                # Format code
cargo clippy             # Lint checks
```

The project uses Nix Flakes for development environment. Enter with `nix develop` or automatically via direnv (`direnv allow`).

## Architecture

### Core Components

- **app.rs** - Central application state, page navigation (Index/Show), search modes, and Erwin answer filtering
- **db.rs** - SQLite database interface for questions, answers, and comments
- **event.rs** - Cross-platform keyboard/terminal event polling at ~60fps with event coalescing
- **content.rs** - Content rendering pipeline: HTML → text extraction → wrapping → syntax highlighting
- **html.rs** - HTML parsing with entity decoding and code block extraction
- **highlight.rs** - Syntax highlighting using syntect

### UI Module (`src/ui/`)

- **index.rs** - Question list with sortable columns and fuzzy search
- **show.rs** - Question detail view with dual-pane layout (question left, Erwin's answer right when width >= 160)
- **styles.rs** - TUI styling and color definitions

### Search Module (`src/search/`)

- **fuzzy.rs** - Fast fuzzy matching on question titles using nucleo
- **semantic.rs** - Semantic search stub (ONNX runtime not configured)

### Rendering Pipeline

```
HTML Content → Parse & Extract → Text Wrapping → Syntax Highlighting → UI Rendering
```

### Key Patterns

- Single `App` struct holds all application state
- Page-based navigation (Index vs Show views)
- Cached rendered content to avoid recomputation
- Unicode-aware width calculations for proper terminal rendering
- Erwin's answers identified by author name containing "erwin" and highlighted in yellow

### Database Schema

Questions, answers, and comments are stored in SQLite. Optional semantic search requires sqlite-vec extension with answer_embeddings table.

# ErwinDB

A terminal UI for exploring [Erwin Brandstetter's](https://stackoverflow.com/users/939860/erwin-brandstetter) Stack Overflow answers. Browse questions, read syntax-highlighted code, and learn from one of the most knowledgeable PostgreSQL experts on Stack Overflow.

## Features

- **Sortable question list** - Sort by date, score, views, or answer count
- **Syntax-highlighted code blocks** - SQL and other languages rendered beautifully
- **Erwin highlighting** - His answers are visually emphasized with a gold sidebar
- **Split-pane view** - On wide terminals (160+ cols), view Erwin's answer alongside the question
- **Link navigation** - Jump between linked Stack Overflow questions in your database
- **Vim-style controls** - `j/k` to scroll, `g/G` for top/bottom, `1-5` to sort
- **Semantic search** - Search answer content using ML embeddings, not just titles

## Prerequisites

One of:

- [Nix](https://nixos.org/) with flakes enabled
- [Bun](https://bun.sh/) runtime (for manual installation)

## Quick Start

### Using a Release Binary

Download a pre-built binary from the [releases page](https://github.com/ahacop/erwindb/releases) and run:

```bash
./erwindb
```

### From Source

```bash
# Enter dev environment
direnv allow  # or: nix develop

# Install dependencies
npm install

# Launch the TUI
npm run tui
```

## Build

Compile a standalone binary with embedded dependencies:

```bash
bun build --compile tui.tsx --outfile erwindb
```

## TUI Controls

### Index View

| Key             | Action                                           |
| --------------- | ------------------------------------------------ |
| `j/k` or arrows | Move selection                                   |
| `1-5`           | Sort by column (ID, Date, Score, Views, Answers) |
| `/`             | Search titles                                    |
| `Esc`           | Clear search                                     |
| `g/G`           | Jump to top/bottom                               |
| `Enter`         | View question                                    |
| `o`             | Open in browser                                  |
| `q`             | Quit                                             |

### Question View

| Key                 | Action                                                          |
| ------------------- | --------------------------------------------------------------- |
| `j/k` or arrows     | Scroll                                                          |
| `d/u` or space/pgup | Page down/up                                                    |
| `e`                 | Jump to Erwin's answer (or toggle split-pane on wide terminals) |
| `E`                 | Switch focus between panes (split view)                         |
| `Tab`               | Cycle through links                                             |
| `Enter`             | Follow focused link                                             |
| `o`                 | Open in browser                                                 |
| `b/q`               | Back to index                                                   |

## Diagnostics

Run with `--check` to validate your setup:

```bash
./erwindb --check
```

This verifies the database, models, and required extensions are properly configured.

## Configuration

ErwinDB looks for data files in the following locations (in order):

| Variable                | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `ERWINDB_HOME`          | Explicit override for data directory                                |
| `XDG_DATA_HOME/erwindb` | Linux XDG standard (`~/.local/share/erwindb` by default)            |
| Platform defaults       | `/opt/homebrew/share/erwindb` (macOS), `/usr/share/erwindb` (Linux) |

## Development

For maintainer documentation including scraping and embedding commands, see [docs/scraping.md](docs/scraping.md).

## License

This project has two separate licenses:

- **Code** (TUI, scraper, utilities): [GNU General Public License v3.0](LICENSE)
- **Data** (Stack Overflow content in the database): [CC BY-SA](LICENSE-DATA.md) - content from Stack Overflow is licensed under Creative Commons Attribution-ShareAlike, with the specific version (2.5, 3.0, or 4.0) depending on when it was originally posted

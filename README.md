# ErwinDB

A TUI for browsing [Erwin Brandstetter's](https://stackoverflow.com/users/939860/erwin-brandstetter) Stack Overflow Q&A content.

![Erwin Brandstetter's Stack Overflow Profile](docs/erwin-profile.png)

Erwin Brandstetter is a PostgreSQL consultant with 670k+ reputation and nearly 7,000 answers on Stack Overflow.

## Why Erwin's Answers?

I can't tell you how many times over the years I've searched for some Postgres-related question on SO, and found an answer from Erwin Brandstetter that was just so thorough and informative. I've definitely leveled up as a developer from learning from his answers.

He:
- Links to and quotes the PostgreSQL manual constantly, showing you exactly where features are documented
- Notes which features work in which Postgres versions, and updates old answers when new versions add capabilities
- Addresses edge cases you wouldn't think of—NULL handling, concurrency, race conditions
- Benchmarks multiple approaches with actual timing results

## Why This App?

ErwinDB lets you browse Erwin's answers offline and search them quickly in a TUI. Features include semantic search, opening links in an external browser, and an Erwin-mode that highlights his answers.

## Demos

[![ErwinDB Demo](https://asciinema.org/a/5dJCmmFgbXWWfcdQ.svg)](https://asciinema.org/a/5dJCmmFgbXWWfcdQ)

[![Fuzzy Search](https://asciinema.org/a/pjeEHo97VNtvEUeX.svg)](https://asciinema.org/a/pjeEHo97VNtvEUeX)

[![Semantic Search](https://asciinema.org/a/QGqdENFrHq1KMREm.svg)](https://asciinema.org/a/QGqdENFrHq1KMREm)

[![Erwin Mode](https://asciinema.org/a/vLamRTcEw1sruyt2.svg)](https://asciinema.org/a/vLamRTcEw1sruyt2)

## Installation

### Cargo

```bash
cargo install erwindb
```

### Homebrew

```bash
brew install ahacop/tap/erwindb
```

### Nix

```bash
nix run github:ahacop/erwindb
# or
nix profile install github:ahacop/erwindb
```

### From source

```bash
git clone https://github.com/ahacop/erwindb
cd erwindb
cargo build --release
```

## Features

- Browse questions where Erwin Brandstetter has answered
- Fuzzy search on question titles
- Semantic search using ML embeddings
- Syntax-highlighted code blocks
- Dual-pane view (question + Erwin's answer side-by-side on wide terminals)

## Keyboard Shortcuts

### Question List

| Key       | Action                                           |
| --------- | ------------------------------------------------ |
| `j` / `↓` | Move down                                        |
| `k` / `↑` | Move up                                          |
| `g`       | Go to top                                        |
| `G`       | Go to bottom                                     |
| `Space`   | Page down                                        |
| `Ctrl+d`  | Half page down                                   |
| `Ctrl+u`  | Half page up                                     |
| `Enter`   | View question                                    |
| `/`       | Fuzzy search                                     |
| `?`       | Semantic search                                  |
| `Esc`     | Clear search                                     |
| `1-5`     | Sort by column (ID, Date, Score, Views, Answers) |
| `o`       | Open in browser                                  |
| `q`       | Quit                                             |

### Question Detail

| Key           | Action                                         |
| ------------- | ---------------------------------------------- |
| `j` / `↓`     | Scroll down                                    |
| `k` / `↑`     | Scroll up                                      |
| `g`           | Go to top                                      |
| `G`           | Go to bottom                                   |
| `Space` / `d` | Page down                                      |
| `u`           | Page up                                        |
| `e`           | Cycle to next Erwin answer / toggle Erwin pane |
| `E`           | Cycle to previous Erwin answer                 |
| `Tab`         | Focus next link                                |
| `Shift+Tab`   | Focus previous link                            |
| `o`           | Open focused link or question in browser       |
| `q` / `b`     | Back to list                                   |

## Development

```bash
cargo build              # Debug build
cargo build --release    # Optimized build
cargo run                # Run the application
cargo fmt                # Format code
cargo clippy             # Lint checks
```

### Releasing

```bash
./scripts/release        # Bump patch version (0.9.4 -> 0.9.5)
./scripts/release 1.0.0  # Set specific version

git push origin main --tags  # Trigger release workflow
```

## License

This project has two separate licenses:

- **Code** (TUI, scraper, utilities): [GNU General Public License v3.0](LICENSE)
- **Data** (Stack Overflow content in the database): [CC BY-SA](LICENSE-DATA.md) - content from Stack Overflow is licensed under Creative Commons Attribution-ShareAlike, with the specific version (2.5, 3.0, or 4.0) depending on when it was originally posted

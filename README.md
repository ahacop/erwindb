# ErwinDB

A TUI for browsing [Erwin Brandstetter's](https://stackoverflow.com/users/939860/erwin-brandstetter) Stack Overflow Q&A content.

![Erwin Brandstetter's Stack Overflow Profile](docs/erwin-profile.png)

Erwin Brandstetter is a PostgreSQL consultant based in Vienna, Austria with 670k+ reputation and nearly 7,000 answers on Stack Overflow. His answers are an invaluable resource for anyone working with PostgreSQL.

## Why This Exists

![Stack Overflow Q&A count over time](docs/stackoverflow-decline.jpg)

## Features

- Browse questions where Erwin Brandstetter has answered
- Fuzzy search on question titles
- Semantic search using ML embeddings
- Syntax-highlighted code blocks
- Dual-pane view (question + Erwin Brandstetter's answer side-by-side)

## License

This project has two separate licenses:

- **Code** (TUI, scraper, utilities): [GNU General Public License v3.0](LICENSE)
- **Data** (Stack Overflow content in the database): [CC BY-SA](LICENSE-DATA.md) - content from Stack Overflow is licensed under Creative Commons Attribution-ShareAlike, with the specific version (2.5, 3.0, or 4.0) depending on when it was originally posted

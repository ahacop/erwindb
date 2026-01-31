# Scraping & Embedding Documentation

This document covers how to populate and maintain the ErwinDB database. These commands are primarily for maintainers and developers.

## Prerequisites

- [Deno](https://deno.land/) runtime
- Optional: `STACKOVERFLOW_API_KEY` in `.env` for higher API quota (10,000 vs 300 requests/day)

## Scraper Commands

The scraper fetches questions and answers from Stack Overflow and stores them in a SQLite database.

```bash
deno run --allow-net --allow-read --allow-write scraper.ts <command> [args]
```

| Command | Description |
|---------|-------------|
| `stats` | Show database statistics |
| `fetchIds [pages]` | Fetch question IDs from API (default: 1 page) |
| `scrapeNext [n]` | Scrape next n unscraped questions (default: 5) |
| `scrapeOne <id>` | Scrape a specific question by ID |
| `list [n]` | List scraped questions (default: 10) |
| `print <id>` | Print a specific question to stdout |
| `search <term> [n]` | Search questions (default limit: 5) |
| `rescrape <id>` | Re-scrape a question (fetch fresh data) |
| `rescrapeAll [n]` | Re-scrape n already-scraped questions (default: 10) |
| `delete <id>` | Delete a question and all its data |
| `truncate` | Delete all scraped data (keeps question IDs) |

### Examples

```bash
# Fetch question IDs from first 5 pages of Erwin's answers
deno run --allow-net --allow-read --allow-write scraper.ts fetchIds 5

# Scrape the next 20 unscraped questions
deno run --allow-net --allow-read --allow-write scraper.ts scrapeNext 20

# Re-scrape a specific question to get updated data
deno run --allow-net --allow-read --allow-write scraper.ts rescrape 866465
```

## Embedding Commands

Embeddings enable semantic search, allowing users to search answer content (not just titles) using natural language queries.

| Command | Description |
|---------|-------------|
| `embedStats` | Show embedding coverage statistics |
| `embedNext [n\|all]` | Embed next n unembedded answers (default: 50), or `all` remaining |
| `reembed [n\|all]` | Regenerate embeddings for n answers, or all if `all` or omitted |
| `semanticSearch <query>` | Search answers using semantic similarity |

### Examples

```bash
# Check embedding coverage
deno run --allow-net --allow-read --allow-write scraper.ts embedStats

# Embed next 100 answers
deno run --allow-net --allow-read --allow-write scraper.ts embedNext 100

# Embed all remaining answers
deno run --allow-net --allow-read --allow-write scraper.ts embedNext all

# Regenerate all embeddings (e.g., after model update)
deno run --allow-net --allow-read --allow-write scraper.ts reembed all

# Test semantic search
deno run --allow-net --allow-read --allow-write scraper.ts semanticSearch "optimize postgresql queries"
```

## Configuration

### API Key

Set `STACKOVERFLOW_API_KEY` in a `.env` file in the project root:

```
STACKOVERFLOW_API_KEY=your_api_key_here
```

Without an API key, you're limited to 300 requests/day. With a key, the limit increases to 10,000 requests/day.

Get an API key from [Stack Apps](https://stackapps.com/).

### Database Location

The scraper uses `sqlite.db` in the current directory by default. This is the same database the TUI reads from.

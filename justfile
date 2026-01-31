# ErwinDB development commands

# Default recipe
default:
    @just --list

# Run the TUI
run:
    cargo run

# Build release binary
build:
    cargo build --release

# Run with cargo-watch
watch:
    cargo watch -x run

# Format code
fmt:
    cargo fmt

# Lint
lint:
    cargo clippy

# Scraper commands (run from root dir)
deno := "deno run --allow-net --allow-read --allow-write --allow-env --allow-ffi"
scraper := "scraper/scraper.ts"

# Show database statistics
stats:
    {{deno}} {{scraper}} stats

# Fetch question IDs from Stack Overflow API
fetch-ids pages="1":
    {{deno}} {{scraper}} fetchIds {{pages}}

# Scrape next N unscraped questions
scrape count="5":
    {{deno}} {{scraper}} scrapeNext {{count}}

# Scrape a specific question by ID
scrape-one id:
    {{deno}} {{scraper}} scrapeOne {{id}}

# List scraped questions
list count="10":
    {{deno}} {{scraper}} list {{count}}

# Search questions by term
search term:
    {{deno}} {{scraper}} search "{{term}}"

# Generate embeddings for next N answers
embed count="50":
    {{deno}} {{scraper}} embedNext {{count}}

# Generate embeddings for all remaining answers
embed-all:
    {{deno}} {{scraper}} embedNext all

# Show embedding statistics
embed-stats:
    {{deno}} {{scraper}} embedStats

# Semantic search
semantic-search query:
    {{deno}} {{scraper}} semanticSearch "{{query}}"

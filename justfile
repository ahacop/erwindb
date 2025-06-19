# ErwinDB - Stack Overflow Scraper and TUI

# List available commands
default:
    @just --list

# Launch the TUI
tui:
    bun tui.tsx

# Download ML models if not present
download-models:
    #!/usr/bin/env bash
    if [ ! -f models/sentence-transformers/all-MiniLM-L6-v2/config.json ]; then
        echo "Downloading ML models..."
        ./scripts/download-models.sh models
    else
        echo "Models already present"
    fi

# Build standalone binary with embedded database (fully portable!)
build: download-models
    bun build --compile tui.tsx --outfile erwindb
    @echo "Built portable binary: ./erwindb"

# Run the compiled binary
run: build
    ./erwindb

# Type check all TypeScript files
typecheck:
    bun run typecheck

# Database statistics
stats:
    deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts stats

# Scrape next N questions (default: 10)
scrape count="10":
    deno run --allow-net --allow-read --allow-write scraper.ts scrapeNext {{count}}

# Scrape a specific question by ID
scrape-one id:
    deno run --allow-net --allow-read --allow-write scraper.ts scrapeOne {{id}}

# Fetch question IDs from API (default: 1 page = 100 questions)
fetch-ids pages="1":
    deno run --allow-net --allow-read --allow-write scraper.ts fetchIds {{pages}}

# List scraped questions (default: 10)
list count="10":
    deno run --allow-net --allow-read --allow-write scraper.ts list {{count}}

# Search questions by title
search term limit="5":
    deno run --allow-net --allow-read --allow-write scraper.ts search "{{term}}" {{limit}}

# Embedding statistics
embed-stats:
    deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts embedStats

# Embed next N answers (default: 50)
embed count="50":
    deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts embedNext {{count}}

# Embed all remaining answers (keeps model in memory)
embed-all:
    deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts embedNext all

# Semantic search for answers
semantic-search query limit="10":
    bun search.ts "{{query}}" {{limit}}

# Regenerate embeddings for N answers (optional limit)
reembed limit="":
    #!/usr/bin/env bash
    if [ -z "{{limit}}" ]; then
        deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts reembed
    else
        deno run --allow-net --allow-read --allow-write --allow-ffi --allow-env --allow-sys scraper.ts reembed {{limit}}
    fi

# Get version from package.json
version := `jq -r .version package.json`

# Build distribution package (for release testing)
dist:
    ./scripts/build.sh {{version}}

# Run the distribution build
dist-run:
    #!/usr/bin/env bash
    PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    [[ "$ARCH" == "x86_64" ]] && ARCH="x64"
    [[ "$ARCH" == "aarch64" ]] && ARCH="arm64"
    (cd ./dist/erwindb-{{version}}-${PLATFORM}-${ARCH} && ./erwindb)

# Clean build artifacts
clean:
    rm -f erwindb

# Clean distribution builds
dist-clean:
    rm -rf dist/

# Clean cached models
clean-models:
    rm -rf node_modules/@huggingface/transformers/.cache

# Delete all embeddings from database
clean-embeddings:
    sqlite3 erwin_stackoverflow.db "DELETE FROM answer_embeddings;"
    @echo "✅ Deleted all embeddings"

# Install dependencies
install:
    bun install

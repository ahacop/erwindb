.DEFAULT_GOAL := run

.PHONY: run
run:
	deno run --allow-net --allow-read --allow-write scraper.ts

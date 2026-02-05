# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mouse support for link hover highlighting and click to open links
- Start link cycling from visible viewport instead of document boundaries

### Changed

- Refactor mouse handling and extract shared link highlighting logic

## [0.9.10] - 2026-02-02

### Changed

- Use platform cache directory for fastembed models
- Crop and optimize erwin-mode screenshot

## [0.9.9] - 2026-02-02

### Fixed

- Revert "Strip redundant version from Homebrew formula"
- Fix demo links in README.md
- Fix video demos not displaying on GitHub README

### Changed

- Improve dual-pane header alignment with half-block transition
- Rename LICENSE-DATA.md to fix GitHub license detection

## [0.9.8] - 2026-02-02

### Added

- Add embeddings to database
- Add 0 key to restore relevance sort during fuzzy search
- Auto-refresh cached database when version changes

### Fixed

- Preserve selected question when changing sort order
- Add scroll offset for index list navigation
- Disable column sorting for semantic search results
- Filter fuzzy search results by relative score threshold
- Fix fuzzy search highlighting for matched results
- Fix sort indicators for search results

### Changed

- Optimize scraper with comprehensive Stack Overflow API filter
- Remove obsolete slow scraping methods

## [0.9.7] - 2026-02-01

### Changed

- Use native ARM64 runner and latest runner versions
- Update build-test workflow to use glibc targets
- Downgrade fastembed to v4 for glibc compatibility

### Added

- Add separate workflow for testing builds without releasing
- Add demo recordings to README

## [0.9.6] - 2026-02-01

### Changed

- Switch Linux targets from glibc to musl
- Drop x86_64-apple-darwin from release targets

## [0.9.5] - 2026-02-01

### Added

- Add release script and development docs

## [0.9.4] - 2026-02-01

### Changed

- Update dependencies to latest versions

## [0.9.3] - 2026-02-01

### Changed

- Embed SQLite database in binary for self-contained distribution

## [0.9.2] - 2026-02-01

### Added

- Enable Homebrew tap publishing

## [0.9.1] - 2026-02-01

### Added

- Add Homebrew installer with prebuilt binaries

## [0.9.0] - 2026-01-31

### Added

- Initial release
- TUI application for browsing Erwin Brandstetter's Stack Overflow Q&A
- Fuzzy search on question titles
- Sortable columns (relevance, votes, answers, date)
- Dual-pane layout for wide terminals (question left, Erwin's answer right)
- Syntax highlighting for code blocks
- Keyboard navigation with vim-style bindings
- Link highlighting and opening in browser

[Unreleased]: https://github.com/ahacop/erwindb/compare/v0.9.10...HEAD
[0.9.10]: https://github.com/ahacop/erwindb/compare/v0.9.9...v0.9.10
[0.9.9]: https://github.com/ahacop/erwindb/compare/v0.9.8...v0.9.9
[0.9.8]: https://github.com/ahacop/erwindb/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/ahacop/erwindb/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/ahacop/erwindb/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/ahacop/erwindb/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/ahacop/erwindb/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/ahacop/erwindb/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/ahacop/erwindb/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/ahacop/erwindb/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ahacop/erwindb/releases/tag/v0.9.0

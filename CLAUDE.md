# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ! EXTREMELY IMPORTANT RULES

### Code Quality Checks

**ALWAYS run the following commands before completing any task:**

1. Automatically use the IDE's built-in diagnostics tool to check for linting and type errors:

- Run `mcp__ide__getDiagnostics` to check all files for diagnostics
- Fix any linting or type errors before considering the task complete
- Do this for any file you create or modify

This is a CRITICAL step that must NEVER be skipped when working on any code-related task

### File Size Limits

- **Maximum 250 lines per file** - If a file exceeds this limit:
  - Extract large sections into separate component files
  - Move related functionality into dedicated modules
  - Split complex components into smaller, focused components
- This ensures maintainability and better code organization

### Command Reminders

- **Always remember to use `trash` command for removing file instead of `rm`, `trash` is available in the terminal**

## Project Overview

A Next.js application that provides a screenshot API service using Puppeteer. It captures screenshots of web pages, videos, and social media content (Instagram, X/Twitter, YouTube) with special handling for Cloudflare challenges and cookie banners.

## Development Commands

### Core Commands

```bash
# Install dependencies (requires pnpm)
pnpm install

# Run development server (uses Turbopack)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Code Quality Commands

```bash
# Run all linting and checks
pnpm lint

# Fix all auto-fixable issues
pnpm fix

# Individual checks
pnpm lint:types        # TypeScript type checking
pnpm lint:eslint       # ESLint checking
pnpm lint:prettier     # Prettier formatting check
pnpm lint:css          # Stylelint CSS/PostCSS check
pnpm lint:md           # Markdown linting
pnpm lint:spelling     # Spell checking
pnpm lint:knip         # Find unused code
pnpm lint:package-json # Validate package.json
```

### Utility Commands

```bash
# Update dependencies
pnpm update:dependencies

# Deduplicate packages
pnpm dedupe

# Clean build artifacts
pnpm clean

# Release new version
pnpm release
```

## Key Components

The main screenshot API endpoint is `/api/try` (src/app/try/route.ts) which:

- Accepts URL, fullpage boolean, and img_index parameters
- Handles special cases for YouTube, Instagram, X/Twitter
- Uses Puppeteer with headless Chrome for rendering
- Implements Cloudflare challenge bypass and cookie banner removal

## Project Documentation

Important documentation files are maintained in the `docs` directory. When starting work on this project, please load these memory files:

- **`docs/project_overview.md`** - Project purpose, tech stack, and architecture
- **`docs/suggested_commands.md`** - All development commands organized by category
- **`docs/code_style_conventions.md`** - TypeScript, React, and styling standards
- **`docs/task_completion_checklist.md`** - Quality gates and completion requirements
- **`docs/project_structure.md`** - Directory layout and key files explanation
- **`docs/frontend_rules.md`** - Comprehensive accessibility and code quality rules

These files contain essential information for understanding and working with the codebase effectively.

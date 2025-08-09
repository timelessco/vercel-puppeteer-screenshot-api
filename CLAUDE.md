# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ! EXTREMELY IMPORTANT RULES

### Command Reminders

- **Always remember to use `trash` command for removing file instead of `rm`, `trash` is available in the terminal**

### Code Style Conventions

Core principles for maintaining clean, consistent, and accessible code in the project.

#### Task Completion Checklist

**Critical Requirements:**

Ensure all items are complete before finishing any task.

- Run `mcp__ide__getDiagnostics` before completing any task
- Run `pnpm fix` to auto-fix all issues
- For subsequent targeted fixes, use individual `fix:` commands
- Only Max 250 lines per file - split larger files into modules
- Only Functional Programming, Never Class Based Code
- Only Named exports - Never default exports
- TypeScript strict mode always enabled
- For local builds use `pnpm build:local`, `pnpm build` is for Vercel only

See [`docs/task_completion_checklist.md`](./docs/task_completion_checklist.md) for complete checklist.

**Quick Reference:**

- Components: `PascalCase` | Functions: `camelCase` | Constants: `UPPER_SNAKE_CASE`
- Server components by default, `"use client"` when needed
- Tailwind CSS v4 with `cn()` for conditional classes
- Type deduction over custom interfaces (see type guidelines)

**File Organization:**

- `/src/components/` - Reusable components
- `/src/ui/[page]/` - Page-specific components
- `/src/utils/` - Helper functions
- `/src/hooks/` - Custom React hooks

**Quality Gates:**

- ESLint, Prettier, Stylelint, Knip, cspell

See [`docs/code_style_conventions.md`](./docs/code_style_conventions.md) for full details.

### Type Deduction Best Practices

Deduce from existing library types rather than creating custom interfaces. Types flow top-to-bottom from parent to child functions.

**Quick Reference:**

- `Parameters<Function>[index]` - extract parameter types
- `ReturnType<typeof function>` - extract return types
- `Pick<Type, Keys>` / `Omit<Type, Keys>` - reuse partial types
- `Awaited<Type>` - promise resolutions
- `&` - extend existing types

**Before creating any type, check if you can:**

1. Use TypeScript utility types (`Parameters<>`, `ReturnType<>`, `Pick<>`)
2. Import directly from the library
3. Extend or compose existing types

**Common patterns:**

- Library methods: `Parameters<Library["method"]>[index]`
- Factory functions: `ReturnType<typeof createFactory>`
- Configuration: Extract to named types when reused

See [`docs/type_deduction_guidelines.md`](./docs/type_deduction_guidelines.md) for examples.

### Frontend & Accessibility Rules

Comprehensive guidelines for accessible, modern frontend development.

**Core Accessibility:**

- Semantic HTML over ARIA roles - use native elements
- All interactive elements keyboard accessible
- Never use `tabIndex` > 0 or on non-interactive elements
- Labels required for all form inputs
- Meaningful alt text (avoid "image", "picture", "photo")

**Modern Standards:**

- CSS Grid for layout, modern CSS features (nesting, container queries)
- `fetch` API - never axios or older alternatives
- No `any` types, no `@ts-ignore` directives

**React/Framework Rules:**

- Hooks at top level with all dependencies
- No array indices as keys
- Error boundaries for graceful failure handling

**Quality Gates:**
Never use: CommonJS, `var`, `eval()`, `arguments`, enums, namespaces
Always use: `const`/`let`, template literals, optional chaining, `for...of`

See [`docs/frontend_rules.md`](./docs/frontend_rules.md) for full details.

### Project Overview

**Next.js screenshot API** optimized for Vercel serverless deployment.
**Stack:** TypeScript strict, Next.js App Router, Puppeteer, Tailwind CSS.
**Features:** Web screenshots, social media (Instagram/X/YouTube), video thumbnails, Cloudflare bypass.
**Endpoint:** `/api/try` returns JSON with base64 screenshot, 300s timeout limit.
See [`docs/project_overview.md`](./docs/project_overview.md) for architecture details.

### Development Commands

Essential commands for development, quality checks, and deployment.

**Core Development:**

```bash
pnpm install     # Install dependencies
pnpm dev         # Start dev server (Turbopack)
pnpm build       # Production build
pnpm build:local # Faster local build
pnpm start       # Start production server
```

**Quality Checks & Fixes:**

```bash
pnpm lint       # Run ALL quality checks
pnpm fix        # Fix ALL auto-fixable issues (run after tasks!)
pnpm lint:types # TypeScript strict checks

# Individual fix commands for targeted corrections:
pnpm fix:eslint   # Auto-fix ESLint issues
pnpm fix:prettier # Format with Prettier
pnpm fix:css      # Auto-fix CSS issues
pnpm fix:spelling # Auto-fix spelling
pnpm fix:md       # Auto-fix Markdown
pnpm fix:knip     # Remove unused code
```

See [`docs/suggested_commands.md`](./docs/suggested_commands.md) for full command reference.

### Project Structure

**Key directories:**

- `/src/app/try/route.ts` - Main screenshot API endpoint
- `/src/utils/puppeteer/` - Browser automation utilities
- `/scripts/` - Build scripts, release automation
- See File Organization section for component structure

**Import alias:** `@/*` → `./src/*`

See [`docs/project_structure.md`](./docs/project_structure.md) for complete file tree.

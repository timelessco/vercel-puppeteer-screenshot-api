# GitHub Copilot Instructions

## Architecture Overview

This is a Next.js App Router application providing a serverless screenshot API using Puppeteer. The core flow centers around `/try` route (`src/app/try/route.ts`) which:

- Accepts URL, fullpage, and img_index parameters via GET requests
- Handles special cases for YouTube (metadata + thumbnail), Instagram/X (dedicated scrapers), and video files (MP4 rendering)
- Uses `rebrowser-puppeteer-core` with `@sparticuz/chromium-min` for Vercel serverless compatibility
- Implements anti-bot detection (Cloudflare challenges, cookie banners, ad blocking)

## Critical Development Patterns

### Puppeteer Browser Management

- **Environment Detection**: Different launch args for Vercel vs local (`VERCEL_ONLY_ARGS` vs `SHARED_LAUNCH_ARGS` in `browser-launcher.ts`)
- **Resource Cleanup**: Always use try/finally blocks with `closeBrowser()` to prevent memory leaks
- **Timeout Handling**: 300-second max duration enforced both in Next.js config and browser launcher

### Error Handling & Logging

- Use structured logging via custom `Logger` class (`src/utils/puppeteer/logger.ts`)
- Implement retry logic (2 attempts for navigation, 2 for screenshots)
- Return JSON responses with proper HTTP status codes, never throw uncaught errors

### Site-Specific Handlers

- **Pattern**: Each platform has dedicated handler in `src/utils/puppeteer/site-handlers/`
- **Instagram**: Uses `img_index` parameter to select specific image from carousels
- **Twitter/X**: Direct screenshot with metadata extraction
- **YouTube**: Extracts videoId and redirects to thumbnail URL (`YOUTUBE_THUMBNAIL_URL`)
- **Video Files**: Renders in `<video>` tag and screenshots the frame

## Code Quality Requirements

### TypeScript Strictness

- **No `any` types** - use `unknown` when type is uncertain
- **No default exports** - always use named exports: `export const ComponentName = () => {}`
- **Interface definitions** required for all props and complex objects

### File Organization

- **250-line limit per file** - extract into separate modules when exceeded
- **Named exports only** - enables better tree-shaking and refactoring
- **Absolute imports** using `@/` path mapping for `src/` directory

### Essential Commands

```bash
# Development with Turbopack
pnpm dev

# Quality checks (run before any commit)
pnpm lint       # All linting
pnpm lint:types # TypeScript strict checking
pnpm fix        # Auto-fix all issues

# Environment validation
# Runs automatically during build via scripts/env/server.js
```

## Project-Specific Conventions

### Component Patterns

- **Server Components**: Default, no "use client" directive needed
- **Client Components**: Explicit `"use client"` directive when interactive
- **Styling**: Use `cn()` helper from `clsx` for conditional Tailwind classes
- **Images**: Always use `NextImage` component with blurhash placeholders

### Environment & Configuration

- **Validation**: All env vars validated via Zod schemas in `scripts/env/`
- **Site Config**: Business logic centralized in `src/utils/siteConfig.ts`
- **External Packages**: Browser automation packages marked as `serverExternalPackages` in `next.config.ts`

### Performance Considerations

- **Bundle Analysis**: Use `pnpm build:analyze` to check bundle size
- **Turbo Cache**: Commands orchestrated via Turbo for parallel execution
- **PWA Support**: Service worker configuration via Serwist

### Anti-Bot Detection Stack

- **Cloudflare Bypass**: `cloudflareChecker.ts` handles challenge detection
- **Cookie Banners**: Automatic ESC key press and dialog detection
- **Ad Blocking**: `@ghostery/adblocker-puppeteer` integrated in browser setup
- **Stealth Mode**: Comprehensive launch arguments to avoid automation detection

When working on this codebase, prioritize understanding the Puppeteer utilities in `src/utils/puppeteer/` as they contain the core business logic for screenshot capture and platform-specific handling.

# Project Structure

## Directory Layout

```text
vercel-puppeteer-screenshot-api/
├── .claude/                    # Claude AI assistant files
│   ├── docs/                  # Project documentation
│   └── settings.local.json    # Local Claude settings
│
├── .github/                    # GitHub configuration
│   ├── actions/               # Custom GitHub Actions
│   ├── ISSUE_TEMPLATE/        # Issue templates
│   ├── workflows/             # CI/CD pipelines
│   │   ├── ci.yml
│   │   ├── semantic-pr.yml
│   │   └── sync-labels.yml
│   └── labels.yml             # Issue/PR label definitions
│
├── .husky/                    # Git hooks
│   ├── commit-msg            # Commit message linting
│   └── pre-commit            # Pre-commit checks
│
├── .next/                     # Next.js build output (git-ignored)
│
├── .turbo/                    # Turbo cache (git-ignored)
│
├── .vscode/                   # VS Code workspace settings
│   ├── extensions.json       # Recommended extensions
│   └── settings.json         # Workspace settings
│
├── docs/                      # Project documentation
│   ├── project_overview.md
│   ├── suggested_commands.md
│   ├── code_style_conventions.md
│   ├── task_completion_checklist.md
│   └── project_structure.md
│
├── node_modules/              # Dependencies (git-ignored)
│
├── scripts/                   # Build and utility scripts
│   ├── env/                  # Environment handling
│   ├── release-it/           # Release automation
│   └── utils/                # Script utilities
│
├── public/                    # Static assets
│   ├── pwa/                  # PWA assets
│   │   ├── icons/            # App icons
│   │   └── splash_screens/   # iOS splash screens
│   └── svg/                  # SVG assets
│
├── src/                       # Source code
│   ├── app/                   # Next.js App Router
│   │   ├── ~offline/         # Offline page
│   │   ├── api/              # API routes
│   │   │   └── render/       # Legacy endpoint
│   │   ├── try/              # Main screenshot API
│   │   │   └── route.ts      # GET endpoint handler
│   │   ├── apple-icon.png    # Apple touch icon
│   │   ├── error.tsx         # Error boundary
│   │   ├── favicon.ico       # Site favicon
│   │   ├── global-error.tsx  # Global error handler
│   │   ├── icon.svg          # App icon
│   │   ├── layout.tsx        # Root layout
│   │   ├── manifest.ts       # PWA manifest generation
│   │   ├── not-found.tsx     # 404 page
│   │   ├── page.tsx          # Homepage
│   │   ├── robots.ts         # Robots.txt generation
│   │   ├── sitemap.ts        # Sitemap generation
│   │   └── sw.ts             # Service worker
│   │
│   ├── components/           # Reusable components
│   │   ├── Container.tsx     # Layout container
│   │   ├── Icon.tsx          # SVG icon component
│   │   ├── NextImage.tsx     # Next.js Image wrapper
│   │   ├── StyledButton.tsx  # Styled button component
│   │   └── StyledNextLink.tsx # Styled link component
│   │
│   ├── icons/                # Icon assets
│   │   ├── svg/              # SVG files
│   │   └── icon-name.d.ts    # Icon type definitions
│   │
│   ├── styles/               # Global styles
│   │   ├── fonts.ts          # Font configuration
│   │   └── globals.css       # Global CSS with Tailwind
│   │
│   ├── ui/                   # UI components
│   │   ├── home-page/        # Homepage components
│   │   └── root-layout/      # Layout components
│   │
│   └── utils/                # Utility functions
│       ├── puppeteer/        # Puppeteer utilities
│       │   ├── cfCheck.ts     # Cloudflare detection
│       │   ├── helpers.ts     # Helper functions
│       │   ├── preload.js     # Browser preload script
│       │   └── utils.ts       # Utility functions
│       ├── assertionUtils.ts # Type assertions
│       ├── errorUtils.ts     # Error handling
│       ├── fetchUtils.ts     # Fetch utilities
│       ├── metadataUtils.ts  # SEO metadata
│       ├── siteConfig.ts     # Site configuration
│       └── typeUtils.ts      # TypeScript utilities
│
├── .editorconfig           # Editor configuration
├── .env.example            # Example environment variables
├── .eslintcache            # ESLint cache
├── .gitattributes          # Git attributes
├── .gitignore              # Git ignore rules
├── .markdownlint-cli2.jsonc # Markdown lint config
├── .npmrc                  # pnpm configuration
├── .nvmrc                  # Node version
├── .prettierignore         # Prettier ignore
├── .release-it.ts          # Release config
├── CLAUDE.md               # Claude AI instructions
├── cspell.json             # Spell checker config
├── eslint.config.js        # ESLint configuration
├── knip.ts                 # Knip config (unused code)
├── LICENSE.md              # License file
├── next-env.d.ts           # Next.js types
├── next.config.ts          # Next.js configuration
├── package.json            # Dependencies and scripts
├── pnpm-lock.yaml          # pnpm lock file
├── postcss.config.js       # PostCSS configuration
├── prettier.config.cjs     # Prettier configuration
├── README.md               # Project documentation
├── sentry.*.config.ts      # Sentry configurations
├── stylelint.config.js     # Stylelint config
├── svgo.config.js          # SVGO optimization config
├── tsconfig.json           # TypeScript config
└── turbo.json              # Turborepo config
```

## Key Directories Explained

### `/src/app`

Next.js App Router pages using file-based routing. Each directory represents a route.

### `/src/components`

Reusable components used across multiple pages. Generic and self-contained.

### `/src/ui`

Page-specific components that are only used within a particular page context.

### `/src/utils`

Utility functions, helpers, and configuration. Includes the important `siteConfig.ts` for all business data.

### `/scripts`

Build and utility scripts including environment handling, release automation, and icon generation.

### `/public`

Static assets served at the root URL. Includes generated service worker.

## Import Aliases

The project uses TypeScript path aliases for cleaner imports:

- `@/*` → `./src/*`

### Core Application File

**src/app/try/route.ts** (~200 lines)

- Main API endpoint for screenshot functionality
- Handles URL validation and parameter parsing
- Orchestrates Puppeteer operations
- Implements platform-specific logic

# Development Commands

## Package Management

```bash
# Install dependencies
pnpm install

# Check for duplicate packages
pnpm dedupe

# Clean build artifacts and dependencies
pnpm clean
```

## Development

```bash
# Start development server with Turbopack
pnpm dev

# Build for production but for local testing
# Faster with Turbopack
pnpm build:local

# Build for production
pnpm build

# Start production server
pnpm start

# Analyze bundle size
ANALYZE=true pnpm build
```

## Code Quality

```bash
# Run all quality checks
pnpm lint

# Fix all auto-fixable issues
pnpm fix

# Individual linting commands
pnpm lint:types        # TypeScript type checking
pnpm lint:eslint       # ESLint checking
pnpm lint:prettier     # Prettier formatting check
pnpm lint:css          # Stylelint CSS/PostCSS check
pnpm lint:md           # Markdown linting
pnpm lint:spelling     # Spell checking with cspell
pnpm lint:knip         # Find unused code and dependencies
pnpm lint:package-json # Validate package.json

# Fix individual tools
pnpm fix:eslint   # Auto-fix ESLint issues
pnpm fix:prettier # Format with Prettier
pnpm fix:css      # Auto-fix CSS issues
pnpm fix:md       # Auto-fix Markdown issues
```

## Release & Deployment

```bash
# Create a new release
pnpm release
```

## Troubleshooting

```bash
# Clear Next.js cache
pnpm clean --next

# Clear all caches and reinstall
pnpm clean && pnpm install
```

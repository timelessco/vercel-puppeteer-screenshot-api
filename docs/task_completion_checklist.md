# Task Completion Checklist

Before considering any task complete, ensure all items in this checklist are addressed:

## 1. Code Quality ✓

- [ ] All TypeScript strict mode checks pass (`pnpm lint:types`)
- [ ] ESLint shows no errors or warnings (`pnpm lint:eslint`)
- [ ] Code is properly formatted (`pnpm lint:prettier`)
- [ ] CSS follows style guidelines (`pnpm lint:css`)
- [ ] No spelling mistakes in code/comments (`pnpm lint:spelling`)
- [ ] No unused code or dependencies (`pnpm lint:knip`)

## 2. Functionality Testing ✓

- [ ] Test basic screenshot functionality:

  ```bash
  curl "http://localhost:3000/try?url=https://example.com"
  ```

- [ ] Test full-page screenshots:

  ```bash
  curl "http://localhost:3000/try?url=https://example.com&fullpage=true"
  ```

- [ ] Verify error handling with invalid URLs
- [ ] Check timeout behavior (requests should fail gracefully after 300s)

## 3. Platform-Specific Testing ✓

Test the following if your changes affect screenshot logic:

### Cookie Banner Sites

- [ ] Test on sites with cookie banners (e.g., medium.com, bbc.com)
- [ ] Verify banners are automatically removed

### Cloudflare Protected Sites

- [ ] Test sites with Cloudflare protection
- [ ] Ensure challenge pages are detected and handled

### Social Media Platforms

- [ ] **Instagram**: Test posts and reels
- [ ] **X/Twitter**: Test tweet screenshots
- [ ] **YouTube**: Verify thumbnail extraction works

### Video Content

- [ ] Test direct MP4 URLs
- [ ] Test video player pages

## 4. Resource Management ✓

- [ ] Browser instances are properly closed in all code paths
- [ ] No memory leaks (monitor during extended local testing)
- [ ] Appropriate timeouts set for all async operations
- [ ] Error cases don't leave hanging resources

## 5. Error Handling ✓

- [ ] All errors return appropriate HTTP status codes
- [ ] Error messages are user-friendly (no stack traces)
- [ ] Errors are logged with sufficient context
- [ ] Network failures are handled gracefully

## 6. Performance Considerations ✓

- [ ] Screenshot generation completes within reasonable time
- [ ] Large pages don't cause memory issues
- [ ] Parallel requests are handled efficiently
- [ ] Build size hasn't increased significantly:

  ```bash
  ANALYZE=true pnpm build
  ```

## 7. Documentation ✓

- [ ] Update relevant documentation if behavior changes
- [ ] Add JSDoc comments for new exported functions
- [ ] Update this checklist if new test scenarios are discovered
- [ ] Ensure code is self-documenting with clear naming

## 8. Pre-Deployment ✓

- [ ] Run full build to catch any issues:

  ```bash
  pnpm build
  ```

- [ ] All git changes are intentional (no debug code)
- [ ] Environment variables are documented if added
- [ ] Commit follows conventional format

## 9. Production Readiness ✓

- [ ] Code works with serverless Chromium (not just local Chrome)
- [ ] Memory usage is appropriate for Vercel limits
- [ ] No hardcoded URLs or credentials
- [ ] Error tracking (Sentry) will capture new error cases

## 10. Final Verification ✓

Run the complete validation suite:

```bash
# Run all checks
pnpm lint

# Fix any auto-fixable issues
pnpm fix

# Ensure a clean build
pnpm clean && pnpm install && pnpm build
```

## Quick Command Reference

```bash
# Full validation
pnpm lint

# Auto-fix issues
pnpm fix

# Test locally
pnpm dev
# Then: curl "http://localhost:3000/try?url=https://example.com"

# Build check
pnpm build
```

## Post-Deployment Monitoring

After deployment:

1. Test the live endpoint with various URLs
2. Monitor Vercel function logs for errors
3. Check Sentry (if configured) for new issues
4. Verify performance metrics in Vercel dashboard

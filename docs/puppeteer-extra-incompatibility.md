# Puppeteer-Extra Incompatibility with Rebrowser-Puppeteer

## Overview

This document explains why `puppeteer-extra` and `puppeteer-extra-plugin-stealth` cannot be integrated with `rebrowser-puppeteer` in this project as of August 2025, and why we use rebrowser-puppeteer's built-in anti-detection features instead.

## The Issue

When attempting to use `puppeteer-extra` with `puppeteer-extra-plugin-stealth` alongside `rebrowser-puppeteer`, the following critical error occurs:

```javascript
TypeError: utils.typeOf is not a function
    at StealthPlugin initialization
```

This error prevents the browser from launching entirely.

## Technical Details

### Errors Encountered

1. **Initial Error**: `utils.typeOf is not a function`
   - Location: During `StealthPlugin()` instantiation
   - Cause: Outdated dependencies in the stealth plugin's dependency chain

2. **Secondary Error**: Module resolution failures

   ```text
   A plugin listed 'puppeteer-extra-plugin-stealth/evasions/chrome.app' as dependency,
   which is currently missing.
   Error: Cannot find module as expression is too dynamic
   ```

   - Cause: ESM/CommonJS incompatibility with dynamic requires

### Root Causes

1. **Outdated Dependencies**: The `puppeteer-extra-plugin-stealth` package relies on outdated versions of `clone-deep` (v0.2.4) and related utilities that are missing required functions like `typeOf` and `forOwn`.

2. **Module System Incompatibility**: This project uses ES modules (`"type": "module"` in package.json), while puppeteer-extra expects CommonJS module resolution for dynamically loading evasion modules.

3. **Dynamic Module Loading**: The stealth plugin uses dynamic `require()` statements to load its evasion modules, which fails in an ESM environment.

## Attempted Solutions (That Didn't Work)

### 1. Dependency Overrides

Attempted to override problematic dependencies in `package.json`:

```json
"pnpm": {
  "overrides": {
    "clone-deep": "^4.0.1",
    "merge-deep": "^3.0.3"
  }
}
```

**Result**: Fixed the initial `utils.typeOf` error but led to module resolution failures.

### 2. Using StealthPlugin Without Instantiation

Attempted `puppeteer.use(StealthPlugin)` instead of `puppeteer.use(StealthPlugin())`
**Result**: No error thrown, but the plugin is ignored entirely (no stealth features applied).

### 3. Manual Evasion Module Imports

Attempted to manually import required evasion modules.
**Result**: Complex dependency chain made this approach impractical.

## The Solution: Rebrowser-Puppeteer's Built-in Stealth

Instead of trying to force compatibility with puppeteer-extra, we use `rebrowser-puppeteer` directly, which includes:

### Built-in Anti-Detection Features

- **Runtime patches**: Removes automation traces from the browser runtime
- **Prevents common detection methods**: Handles Cloudflare, DataDome, and other anti-bot systems
- **Natural browser behavior**: Improved handling of mouse movements, screen coordinates, etc.

### Implementation

```typescript
// Simply use rebrowser-puppeteer without any additional plugins
const puppeteer = await import("rebrowser-puppeteer");
const browser = await puppeteer.launch(launchOptions);
```

## Benefits of This Approach

1. **Simplicity**: No complex plugin system or dependency conflicts
2. **Reliability**: Fewer moving parts means fewer potential failure points
3. **ESM Compatibility**: Works seamlessly with modern ES modules
4. **Maintained**: Rebrowser patches are actively maintained for anti-detection
5. **Performance**: Reduced overhead from not loading multiple plugin layers

## Testing Anti-Bot Effectiveness

To verify anti-detection capabilities, test against:

- <https://bot.sannysoft.com/>
- <https://intoli.com/blog/not-possible-to-block-chrome-headless/chrome-headless-test.html>
- <https://bot-detector.rebrowser.net>
- Sites with Cloudflare protection

## Future Considerations

As of February 2025:

- The `puppeteer-extra-plugin-stealth` hasn't been updated since 2022
- Rebrowser-puppeteer provides equivalent or better anti-detection
- The ecosystem is moving away from plugin-based approaches to built-in solutions

## Conclusion

The incompatibility between puppeteer-extra and rebrowser-puppeteer in an ESM environment, combined with rebrowser's superior built-in anti-detection features, makes using rebrowser-puppeteer alone the optimal solution for this project.

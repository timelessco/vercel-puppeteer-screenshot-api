# Project Overview

## Purpose

This is a Next.js-based screenshot API service designed for serverless deployment on Vercel. It provides a robust solution for capturing web page screenshots with special handling for social media platforms, video content, and anti-bot detection mechanisms.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Framework**: Next.js (App Router)
- **Runtime**: Node.js
- **Browser Automation**: rebrowser-puppeteer-core
- **Chromium**: @sparticuz/chromium-min (serverless-optimized)
- **Styling**: Tailwind CSS
- **Validation**: Zod
- **PWA**: Serwist
- **UI Components**: Ariakit React

## Architecture

### API Design

- **Single Endpoint**: `/try` route handles all screenshot requests
- **Response Format**: JSON with metadata and base64-encoded screenshot
- **Execution Limit**: 300 seconds maximum duration on Vercel
- **Request Handling**: GET requests with URL parameters

### Core Features

1. **General Web Screenshots**: Full-page and viewport capture options
2. **Social Media Integration**:
   - Instagram posts/reels with metadata extraction
   - X/Twitter tweet-specific screenshots
   - YouTube video thumbnail extraction
3. **Video Support**: Direct MP4 and video URL handling
4. **Anti-Bot Detection**:
   - Cloudflare challenge bypass
   - Cookie banner automatic removal
   - Ad blocking via @ghostery/adblocker-puppeteer

### Deployment Strategy

- **Platform**: Optimized for Vercel serverless functions
- **Environment Detection**: Different behavior for dev/production
- **Resource Management**: Automatic browser cleanup
- **Error Handling**: Comprehensive error responses with status codes

## Development Philosophy

- **Type Safety**: Full TypeScript with strict mode
- **Code Quality**: Comprehensive linting and formatting
- **Modern Stack**: Latest React and Next.js features
- **Performance**: Turbopack for fast development builds
- **Security**: No secrets in code, environment variable validation

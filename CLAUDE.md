# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- `npm run dev`: Run development server using wrangler
- `npm run deploy`: Deploy to Cloudflare Workers with minification
- `npx wrangler dev`: Alternative for development server
- `npm test`: No test suite configured yet

## Code Style
- **TypeScript**: Use strict mode with proper type annotations
- **Imports**: Group imports by external packages first, then local modules
- **Error Handling**: Use try/catch with specific error types when possible
- **Functions**: Prefer async/await for asynchronous operations
- **Naming**: Use camelCase for variables/functions, PascalCase for types/interfaces
- **Formatting**: Use 2 spaces for indentation
- **Comments**: Add clear comments for complex logic and public functions
- **Input Validation**: Always validate API inputs
- **ENV Variables**: Stored in `.dev.vars` (gitignored for security)

## Architecture
- Cloudflare Workers application built with Hono
- Three main modules: 
  - `index.ts`: API endpoints
  - `strategy.ts`: Investment signal analysis
  - `telegram.ts`: Notification service
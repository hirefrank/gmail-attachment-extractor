# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Gmail Attachment Extractor that automatically processes emails with specific labels, extracts attachments, and uploads them to Google Drive. The project is currently built as a Deno application with plans to migrate to CloudFlare Workers (see docs/spec.md).

## Development Commands

### Core Tasks
- `deno task run` - Run the main extraction process
- `deno task dev` - Run with auto-reload for development
- `deno task setup` - Initial OAuth setup for Google API authentication
- `deno task scheduler` - Run the hourly scheduler
- `deno task refresh` - Manually refresh OAuth tokens
- `deno task verify` - Type check the codebase

### Debugging
- `DEBUG=1 deno task run` - Run with verbose logging

## Architecture

### Technology Stack
- **Runtime**: Deno (TypeScript)
- **APIs**: Google Gmail API, Google Drive API
- **Authentication**: OAuth 2.0 with automatic token refresh
- **Storage**: JSON files in ./data/ directory
- **Scheduling**: Cron-based hourly execution via scheduler.ts

### Key Components

1. **OAuth Management** (oauth_setup.ts, token_refresh.ts, token_security.ts)
   - Handles Google OAuth flow with local callback server
   - Automatic token refresh before expiration
   - Optional encrypted token storage
   - Re-authentication detection and handling

2. **Main Processing** (main.ts)
   - GmailAttachmentExtractor class handles core logic
   - Queries emails with label "insurance claims/todo"
   - Downloads attachments to temp directory
   - Uploads to Google Drive with formatted naming
   - Updates Gmail labels after processing
   - Tracks processed files to prevent duplicates

3. **File Organization**
   - Drive structure: `Year/MM_SenderLastName_OriginalFilename.ext`
   - Automatic year folder creation
   - Filename sanitization and length limits

### Important Configuration

- **Labels**: Defined in main.ts:16-19
  - Source: "insurance claims/todo"
  - Processed: "insurance claims/processed"
- **Config Storage**: ./data/config.json (contains OAuth tokens)
- **Processing History**: ./data/uploaded_files.json

### CloudFlare Workers Migration

The project has a detailed specification (docs/spec.md) for migrating to CloudFlare Workers. The current branch `cf-workers` suggests active development for this migration. Key differences will include:
- CloudFlare KV storage instead of JSON files
- Weekly scheduling instead of hourly
- REST API calls instead of googleapis npm package
- Simplified token management without proactive refresh

## Error Handling

The application includes comprehensive error handling:
- Exponential backoff for API rate limits
- Graceful handling of authentication failures
- Skip problematic emails without stopping batch
- Detailed logging for troubleshooting
- Automatic re-authentication prompts when needed
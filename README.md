# CloudFlare Workers Gmail Attachment Extractor

A CloudFlare Worker that automatically extracts attachments from Gmail emails with specific labels, uploads them to Google Drive with organized naming, and manages email labels to track processing status.

## Features

- Automated processing on a schedule (default: Weekly on Sundays and monthly on the 1st at midnight UTC)
- Gmail label-based filtering (processes emails with `insurance claims/todo` label)
- Organized Google Drive uploads with year-based folders
- Duplicate file prevention
- Robust error handling and logging
- OAuth 2.0 authentication with automatic token refresh
- Debug mode for controlling web endpoint access

## Project Structure

```
cf-gmail-extractor/
├── src/
│   ├── index.ts           # Main worker entry point
│   ├── config.ts          # Configuration constants
│   ├── types/             # TypeScript type definitions
│   ├── services/          # API service implementations
│   └── utils/             # Utility functions
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── wrangler.toml          # CloudFlare Worker configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

## Development Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a `.dev.vars` file with your environment variables:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   DEBUG_MODE=true  # Enable web endpoints for development
   ```

3. Run tests:
   ```bash
   pnpm test
   ```

4. Start development server:
   ```bash
   pnpm run dev
   ```

### Configuration

Update the `wrangler.toml` file to configure:
- Worker name and compatibility settings
- Cron schedule
- Environment variables
- KV namespace bindings

#### Environment Variables

Required secrets (set in Cloudflare):
```bash
npx wrangler secret put GOOGLE_CLIENT_ID      # Your Google OAuth client ID
npx wrangler secret put GOOGLE_CLIENT_SECRET   # Your Google OAuth client secret
npx wrangler secret put DEBUG_MODE             # Set to "true" to enable web endpoints
```

Optional configuration (set in `wrangler.toml`):
```toml
[vars]
LOG_LEVEL = "info"              # Logging level: error, warn, info, debug
MAX_EMAILS_PER_RUN = "50"       # Maximum emails to process per run
MAX_FILE_SIZE_MB = "25"         # Maximum attachment size in MB
DRIVE_FOLDER_ID = "folder-id"   # Google Drive folder ID for uploads
```

**Note on DRIVE_FOLDER_ID**: 
- If specified, files are uploaded directly to this folder (no intermediate "Gmail Attachments" folder)
- Year subfolders (e.g., "2025") are created inside the specified folder
- If not specified, creates "Gmail Attachments" folder in Drive root, then year subfolders
- Get folder ID from the Google Drive URL: `https://drive.google.com/drive/folders/{FOLDER_ID}`

### CloudFlare KV Namespace

Update the KV namespace ID in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "STORAGE"
id = "YOUR_KV_NAMESPACE_ID"
```

## API Endpoints

- `GET /` - Basic information (always available)
- `GET /health` - Health check endpoint (requires DEBUG_MODE=true)
- `GET /setup` - OAuth setup flow (requires DEBUG_MODE=true)
- `POST /process` - Manual processing trigger (requires DEBUG_MODE=true)
- `GET /status` - Processing status (requires DEBUG_MODE=true)
- `GET /logs` - View error logs (requires DEBUG_MODE=true)

**Note:** All endpoints except `/` require `DEBUG_MODE=true` to be accessible. In production, set `DEBUG_MODE=false` to disable web endpoints for security.

## Deployment

### Prerequisites

1. [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
2. Cloudflare account with Workers KV enabled
3. Google Cloud Project with OAuth 2.0 credentials

### Google API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API and Google Drive API
4. Create OAuth 2.0 credentials (Web application type)
5. Add authorized redirect URI: `https://your-worker.workers.dev/setup`

### CloudFlare Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a KV namespace:
   ```bash
   npx wrangler kv:namespace create STORAGE
   ```

3. Update `wrangler.toml` with your KV namespace ID from the output above

4. Set up required secrets:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

### Deploy

```bash
# Build and deploy
pnpm run deploy

# Or manually
pnpm run build
npx wrangler deploy
```

Your worker will be available at:
```
https://gmail-attachment-extractor.YOUR_SUBDOMAIN.workers.dev
```

### Post-Deployment

1. **Complete OAuth Setup** (see OAuth Setup section below)
2. **Verify Cron Schedule**: Check CloudFlare dashboard to ensure both cron triggers are active (Sundays and 1st of month)
3. **Monitor Initial Run**: Use `wrangler tail` to watch logs during first scheduled execution

### Monitoring

```bash
# View real-time logs
wrangler tail

# Check worker metrics
wrangler metrics
```

### Troubleshooting

**Common Issues:**

1. **OAuth Token Expired**: Enable debug mode and visit `/setup` to re-authorize
2. **Gmail API Rate Limits**: Reduce `MAX_EMAILS_PER_RUN` in wrangler.toml
3. **Drive Upload Failures**: Check file size limits and folder permissions
4. **Cron Not Triggering**: Verify cron syntax in wrangler.toml

### Development

```bash
# Start development server
pnpm run dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch
```

## OAuth Setup

### Initial Setup

1. **Enable debug mode temporarily**:
   ```bash
   npx wrangler secret put DEBUG_MODE
   # Enter "true" when prompted
   ```

2. **Access the OAuth setup page**:
   Navigate to `https://your-worker.workers.dev/setup` in your browser

3. **Complete the OAuth flow**:
   - Click "Authorize with Google"
   - Grant access to Gmail (read/modify) and Google Drive (file management)
   - You'll be redirected back to the worker with a success message

4. **Disable debug mode for production**:
   ```bash
   npx wrangler secret put DEBUG_MODE
   # Enter "false" when prompted (or delete the secret)
   ```

### How It Works

1. The worker runs automatically every Sunday and on the 1st of each month at midnight UTC
2. Searches for emails with the label `insurance claims/todo`
3. Downloads all attachments from matching emails (requires Gmail API format=full)
4. Uploads attachments to your specified Google Drive folder:
   - If DRIVE_FOLDER_ID is set: Creates year subfolders directly in that folder
   - If not set: Creates "Gmail Attachments" folder in Drive root, then year subfolders
   - Files are named: `MM_SenderLastName_OriginalFilename`
5. Moves processed emails to `insurance claims/processed` label
6. Tracks uploaded files to prevent duplicates

### Gmail Label Requirements

- Create these labels in Gmail before running:
  - `insurance claims/todo` - for emails to process
  - `insurance claims/processed` - for completed emails
- Labels are case-sensitive and must match exactly
- The forward slash creates a nested label structure in Gmail
- The worker searches using the full label name with quotes: `label:"insurance claims/todo"`
- Do not use label IDs in configuration - always use the label name

## Migration from Existing Service

### What to Migrate

If you have an existing Deno-based service, you'll need to migrate:

1. **OAuth Tokens** (`oauth_tokens.json`):
   - Contains your Google access and refresh tokens
   - Required for the worker to access Gmail and Drive

2. **Uploaded Files List** (`uploaded_files.json`):
   - List of files already uploaded to prevent duplicates
   - Format: Array of strings like `["2024/01_15 - John Doe - invoice.pdf"]`

3. **Processing Status** (`processing_status.json`) - Optional:
   - Last run time and statistics

4. **Error Logs** (`error_logs.json`) - Optional:
   - Historical error information

### Migration Steps

1. **Locate your existing data** (usually in a `data/` directory):
   ```bash
   ls -la data/
   # Should show: oauth_tokens.json, uploaded_files.json, etc.
   ```

2. **Run the migration**:
   ```bash
   # From the cf-gmail-extractor directory
   pnpm run migrate ../data
   # Or specify the path to your data directory
   pnpm run migrate /path/to/your/data
   ```

3. **Verify the migration**:
   ```bash
   # Check worker status
   curl https://your-worker.workers.dev/status
   ```

### Alternative: Fresh Start

If you don't have existing data or want to start fresh:

1. Simply complete the OAuth setup (see above)
2. The worker will start processing new emails
3. It will skip any files already in your Drive folder

## Troubleshooting

### Common Issues

**404 errors on endpoints (/setup, /process, /status)**
- By default, `DEBUG_MODE=false` which disables all web endpoints except `/`
- Only the cron trigger can run the worker in production
- To enable web endpoints temporarily: 
  ```bash
  echo "true" | npx wrangler secret put DEBUG_MODE
  ```
- Remember to disable after setup: `echo "false" | npx wrangler secret put DEBUG_MODE`

**OAuth "Access blocked" or redirect_uri_mismatch**
- In Google Cloud Console, add the exact redirect URI: `https://your-worker.workers.dev/setup`
- The URI must match exactly (including https and no trailing slash)
- Ensure OAuth consent screen is configured
- Check that both Gmail and Drive APIs are enabled

**No emails found (0 emails processed)**
- Gmail API requires the label name with quotes in the query: `label:"insurance claims/todo"`
- Do NOT use the label ID - use the exact label name
- Verify the Gmail labels exist exactly as: `insurance claims/todo` and `insurance claims/processed`
- Labels are case-sensitive and must include the forward slash
- Check that emails have the correct label applied
- Add `includeSpamTrash: true` to search if emails might be in spam/trash

**Attachments not detected (0 files uploaded despite attachments)**
- Gmail API requires `?format=full` parameter to get attachment metadata
- Without this, the API returns minimal data without attachment info
- This is automatically handled in the current version

**Files uploading to wrong folder structure**
- If DRIVE_FOLDER_ID is set: Files go directly to that folder with year subfolders
- If DRIVE_FOLDER_ID is not set: Creates "Gmail Attachments" folder first
- The service uses the specified folder ID directly without creating intermediate folders

**Drive upload 400 Bad Request errors**
- Gmail attachments use URL-safe base64 encoding (with `-` and `_` characters)
- Must convert to standard base64 (with `+` and `/` characters) before uploading
- Use FormData for multipart uploads instead of manual boundary construction
- Maximum file size is 25MB by default

**"Method not allowed" error**
- The `/process` endpoint requires a POST request: `curl -X POST https://your-worker.workers.dev/process`
- GET requests will return 405 error

### Debug Mode

Debug mode controls access to web endpoints:

**When `DEBUG_MODE=false` (default/production)**:
- Only `/` endpoint is accessible (returns basic info)
- All other endpoints return 404
- Worker runs only via cron schedule
- This is the secure production configuration

**When `DEBUG_MODE=true` (development/setup)**:
- `/health` - Check worker health and configuration
- `/setup` - OAuth setup flow (required for initial setup)
- `/process` - Manual processing trigger (POST request)
- `/status` - View last run status and statistics
- `/logs` - View recent error logs
- `/debug-labels` - Debug Gmail label queries (useful for troubleshooting)

**Security Warning**: Always set `DEBUG_MODE=false` in production to prevent unauthorized access to sensitive endpoints.

**To temporarily enable for setup**:
```bash
# Enable debug mode
echo "true" | npx wrangler secret put DEBUG_MODE

# After setup, disable it
echo "false" | npx wrangler secret put DEBUG_MODE
# Or delete the secret entirely (defaults to false)
npx wrangler secret delete DEBUG_MODE
```

### Monitoring

**View logs in real-time:**
```bash
npx wrangler tail
```

**Check worker metrics:**
```bash
npx wrangler metrics
```

**Enable observability in wrangler.toml:**
```toml
[observability]
enabled = true
```

## License

MIT
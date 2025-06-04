# CloudFlare Workers Gmail Attachment Extractor

A CloudFlare Worker that automatically extracts attachments from Gmail emails with specific labels, uploads them to Google Drive with organized naming, and manages email labels to track processing status.

## Features

- Automated processing on a schedule (default: Weekly on Sunday at midnight UTC)
- Gmail label-based filtering (processes emails with `insurance claims/todo` label)
- Organized Google Drive uploads with year-based folders
- Duplicate file prevention
- Robust error handling and logging
- OAuth 2.0 authentication with automatic token refresh
- Secure OAuth setup endpoint with optional Bearer token protection

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
   SETUP_AUTH_TOKEN=your-secure-token  # Optional: for protecting /setup endpoint
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
npx wrangler secret put SETUP_AUTH_TOKEN       # (Optional) Bearer token for /setup endpoint
```

Optional configuration (set in `wrangler.toml`):
```toml
[vars]
LOG_LEVEL = "info"              # Logging level: error, warn, info, debug
MAX_EMAILS_PER_RUN = "50"       # Maximum emails to process per run
MAX_FILE_SIZE_MB = "25"         # Maximum attachment size in MB
DRIVE_FOLDER_ID = "folder-id"   # (Optional) Specific Google Drive folder ID
```

### CloudFlare KV Namespace

Update the KV namespace ID in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "STORAGE"
id = "YOUR_KV_NAMESPACE_ID"
```

## API Endpoints

- `GET /` - Basic information
- `GET /health` - Health check endpoint
- `GET /setup` - OAuth setup flow (protected with optional Bearer token)
- `POST /process` - Manual processing trigger
- `GET /status` - Processing status
- `GET /logs` - View error logs

## Deployment

### Prerequisites

1. [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
2. Cloudflare account with Workers KV enabled
3. Google Cloud Project with OAuth 2.0 credentials

### Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a production KV namespace:
   ```bash
   npx wrangler kv:namespace create gmail-extractor-prod
   ```

3. Create a preview KV namespace:
   ```bash
   npx wrangler kv:namespace create gmail-extractor-preview --preview
   ```

4. Update `wrangler.toml` with your KV namespace IDs

5. Set up required secrets:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   
   # Optional: Generate and set a secure token for /setup protection
   # Generate token: openssl rand -base64 32
   npx wrangler secret put SETUP_AUTH_TOKEN
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

1. **Generate a secure token** (if you want to protect the /setup endpoint):
   ```bash
   openssl rand -base64 32
   ```

2. **Set the token as a secret**:
   ```bash
   npx wrangler secret put SETUP_AUTH_TOKEN
   # Enter the token when prompted
   ```

3. **Access the OAuth setup page**:
   
   If `SETUP_AUTH_TOKEN` is set:
   ```bash
   # Using curl
   curl -H "Authorization: Bearer YOUR-TOKEN-HERE" https://your-worker.workers.dev/setup
   ```
   
   **Or use a browser with ModHeader extension:**
   - Install [ModHeader](https://modheader.com/) for Chrome/Firefox
   - Click the ModHeader icon in your browser
   - Add a new request header:
     - Name: `Authorization`
     - Value: `Bearer YOUR-TOKEN-HERE`
   - Navigate to `https://your-worker.workers.dev/setup` in your browser
   - The page will load with proper authentication
   
   If no token is set (less secure):
   ```bash
   # Simply navigate to the URL in your browser
   https://your-worker.workers.dev/setup
   ```

4. **Complete the OAuth flow**:
   - Click "Authorize with Google"
   - Grant access to Gmail (read/modify) and Google Drive (file management)
   - You'll be redirected back to the worker with a success message

### How It Works

1. The worker processes emails with the label `insurance claims/todo`
2. Attachments are uploaded to Google Drive (in year-based folders)
3. Processed emails are moved to `insurance claims/processed`
4. Files are named: `MM_DD - Sender Name - Original Filename`
5. Duplicate files are automatically skipped

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

## License

MIT
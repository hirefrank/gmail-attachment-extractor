# CloudFlare Workers Gmail Attachment Extractor

A CloudFlare Worker that automatically extracts attachments from Gmail emails with specific labels, uploads them to Google Drive with organized naming, and manages email labels to track processing status.

## Features

- Weekly automated processing (Sunday midnight UTC)
- Gmail label-based filtering
- Organized Google Drive uploads with year-based folders
- Duplicate file prevention
- Robust error handling and logging
- OAuth 2.0 authentication with automatic token refresh

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
   npm install
   ```

2. Create a `.dev.vars` file with your environment variables:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

- `GOOGLE_CLIENT_ID` - Google OAuth client ID (required)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (required)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: info)
- `MAX_EMAILS_PER_RUN` - Maximum emails to process per run (default: 50)
- `MAX_FILE_SIZE_MB` - Maximum file size in MB (default: 25)

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
- `GET /setup` - OAuth setup flow (coming soon)
- `POST /process` - Manual processing trigger (coming soon)
- `GET /status` - Processing status (coming soon)

## Deployment

```bash
npm run deploy
```

## License

MIT
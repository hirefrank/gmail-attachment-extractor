# CloudFlare Workers Gmail Attachment Extractor - Technical Specification

## Overview
A standalone CloudFlare Worker that automatically extracts attachments from Gmail emails with specific labels, uploads them to Google Drive with organized naming, and manages email labels to track processing status.

## Architecture

### Platform
- **Runtime**: CloudFlare Workers
- **Language**: TypeScript
- **Persistence**: CloudFlare KV Storage
- **APIs**: Google Gmail API, Google Drive API (via direct REST calls)
- **Deployment**: Single Worker script

### Scheduling
- **Frequency**: Weekly
- **Schedule**: Every Sunday at midnight UTC
- **Trigger**: CloudFlare Workers Cron

## Core Functionality

### Email Processing Workflow
1. Query Gmail for emails with label "insurance claims/todo"
2. Filter emails to only those with attachments
3. For each email with attachments:
   - Extract sender information and email date
   - Download each attachment
   - Generate formatted filename: `MM_SenderLastName_OriginalFilename.ext`
   - Create/find year-based folder in Google Drive
   - Upload attachment to appropriate year folder
   - Track uploaded files to prevent duplicates
   - Update email labels: remove "insurance claims/todo", add "insurance claims/processed"
4. Skip problematic emails and continue processing others
5. Log results and any errors

### File Organization
- **Google Drive Structure**:
  ```
  Root Folder/
  ├── 2024/
  │   ├── 01_Smith_invoice.pdf
  │   └── 03_Johnson_receipt.jpg
  └── 2025/
      └── 01_Williams_claim.pdf
  ```
- **Naming Convention**: `MM_SenderLastName_OriginalFilename.ext`
  - MM: Two-digit month (01-12)
  - SenderLastName: Last name from email sender (sanitized, max 20 chars)
  - OriginalFilename: Original attachment name (sanitized, max 50 chars)
  - Total filename length capped at 100 characters

## Data Persistence (CloudFlare KV)

### KV Storage Structure
```typescript
// OAuth Tokens
"oauth_tokens": {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  client_id: string;
  client_secret: string;
}

// Uploaded Files Tracking
"uploaded_files": string[] // Array of "year/filename" entries

// Error Logs
"error_logs": {
  timestamp: string;
  error: string;
  context: string;
}[]

// Processing Status
"last_run": {
  timestamp: string;
  processed_count: number;
  error_count: number;
  status: "success" | "partial" | "failed";
}
```

## API Integration

### Google Gmail API (REST)
- **Endpoint**: `https://www.googleapis.com/gmail/v1/users/me/messages`
- **Operations**:
  - List messages with label filter
  - Get message details
  - Download attachments
  - Modify message labels
- **Authentication**: OAuth 2.0 Bearer tokens

### Google Drive API (REST)
- **Endpoint**: `https://www.googleapis.com/drive/v3/files`
- **Operations**:
  - Search for folders
  - Create folders
  - Upload files (multipart upload)
- **Authentication**: OAuth 2.0 Bearer tokens

## Authentication & Token Management

### Initial Setup
- Google OAuth credentials provided via environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Initial tokens obtained through setup endpoint and stored in KV

### Token Refresh Strategy (Simplified)
- Check token expiry before API calls
- If expired, attempt refresh using refresh_token
- If refresh fails, log error and exit gracefully
- No proactive refresh or re-auth flags (simplified approach)

### Setup Endpoint
- `GET /setup` - Initiates OAuth flow for initial token generation
- Only used during initial deployment
- Stores resulting tokens in KV storage

## Error Handling

### Strategy
- **Continue on Error**: Skip problematic emails, process remaining items
- **Error Logging**: Store errors in KV with context and timestamps
- **No Retries**: Failed items will be attempted again on next weekly run
- **Graceful Degradation**: API failures don't stop entire batch

### Error Types to Handle
- Gmail API rate limits/failures
- Drive API upload failures
- Token refresh failures
- Attachment download failures
- File naming conflicts
- Network timeouts

## Environment Variables

### Required
```
GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>
```

### Optional
```
LOG_LEVEL=info
MAX_EMAILS_PER_RUN=50
MAX_FILE_SIZE_MB=25
```

## File Structure

```
src/
├── index.ts              # Main worker entry point
├── types/
│   ├── gmail.ts          # Gmail API response types
│   ├── drive.ts          # Drive API response types
│   └── storage.ts        # KV storage types
├── services/
│   ├── gmail.service.ts  # Gmail API interactions
│   ├── drive.service.ts  # Drive API interactions
│   ├── auth.service.ts   # OAuth token management
│   └── storage.service.ts # KV storage operations
├── utils/
│   ├── filename.utils.ts # File naming and sanitization
│   ├── date.utils.ts     # Date formatting utilities
│   └── error.utils.ts    # Error handling utilities
└── config.ts             # Configuration constants
```

## Dependencies

### Package.json
```json
{
  "devDependencies": {
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "wrangler": "latest"
  }
}
```

### Wrangler Configuration
```toml
# wrangler.toml
name = "gmail-attachment-extractor"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = ["0 0 * * 0", "0 0 1 * *"]  # Sunday midnight UTC and 1st of month

[[kv_namespaces]]
binding = "STORAGE"
id = "<kv_namespace_id>"
```

## Security Considerations

### Token Security
- OAuth tokens stored in KV (encrypted at rest by CloudFlare)
- No tokens in logs or console output
- Environment variables for sensitive configuration

### API Security
- Use minimum required OAuth scopes
- Implement proper error handling to avoid token leakage
- Rate limiting respect for Google APIs

### Data Protection
- No email content stored permanently
- Only attachment metadata tracked
- Temporary file processing only

## Deployment Process

### Initial Setup
1. Create CloudFlare Worker
2. Set up KV namespace
3. Configure environment variables
4. Deploy worker code
5. Call setup endpoint to initialize OAuth tokens
6. Test with small batch of emails

### Ongoing Deployment
1. Update worker code via Wrangler
2. Environment variables managed through CloudFlare dashboard
3. Monitor execution logs and KV storage

## Monitoring & Logging

### Built-in Monitoring
- CloudFlare Workers analytics dashboard
- Real-time logs via `console.log`
- KV storage metrics

### Custom Logging
- Processing status stored in KV after each run
- Error logs with context and timestamps
- Weekly execution summaries

### No External Notifications
- No email/webhook notifications at this time
- All monitoring through CloudFlare dashboard and KV logs

## Performance Considerations

### Execution Limits
- CloudFlare Worker CPU time: 10ms-50ms per request (depending on plan)
- Memory limit: 128MB
- Consider batch size to stay within limits

### Optimization Strategies
- Process emails in chunks if needed
- Use streaming for large attachments
- Minimal data stored in memory
- Efficient KV read/write operations

## Future Enhancements (Out of Scope)

- Real-time webhook triggers
- Email/SMS notifications
- Web dashboard for monitoring
- Multiple label configurations
- Custom file naming patterns
- Attachment content analysis

## Success Criteria

### Functional Requirements
- ✅ Processes emails with correct labels weekly
- ✅ Uploads attachments to properly organized Drive folders
- ✅ Updates Gmail labels appropriately
- ✅ Prevents duplicate file uploads
- ✅ Handles errors gracefully without stopping batch

### Non-Functional Requirements
- ✅ Executes within CloudFlare Worker limits
- ✅ Maintains OAuth token validity
- ✅ Provides adequate logging for troubleshooting
- ✅ Replaces existing Deno service functionality

## Testing Plan

### Unit Testing

#### Authentication Service Tests
```typescript
describe('AuthService', () => {
  test('should refresh expired tokens', async () => {
    // Mock expired token scenario
    // Verify refresh API call
    // Assert new token stored in KV
  });
  
  test('should handle refresh token failure gracefully', async () => {
    // Mock refresh failure
    // Verify error logging
    // Assert graceful exit
  });
});
```

#### Gmail Service Tests
```typescript
describe('GmailService', () => {
  test('should query emails with correct label filter', async () => {
    // Mock Gmail API response
    // Verify query parameters
    // Assert correct email filtering
  });
  
  test('should download attachments successfully', async () => {
    // Mock attachment API response
    // Verify file data handling
    // Assert proper error handling for failed downloads
  });
  
  test('should update email labels correctly', async () => {
    // Mock label modification API
    // Verify remove/add label operations
    // Assert retry logic on failures
  });
});
```

#### Drive Service Tests
```typescript
describe('DriveService', () => {
  test('should create year folders when missing', async () => {
    // Mock folder search (empty result)
    // Mock folder creation API
    // Verify correct folder structure
  });
  
  test('should upload files with correct naming', async () => {
    // Mock file upload API
    // Verify filename formatting
    // Assert proper folder placement
  });
  
  test('should handle upload failures gracefully', async () => {
    // Mock upload failure scenarios
    // Verify error logging
    // Assert processing continues
  });
});
```

#### Filename Utilities Tests
```typescript
describe('FilenameUtils', () => {
  test('should format filenames correctly', () => {
    // Test various sender name formats
    // Test special characters handling
    // Test length limitations
    // Assert sanitization works properly
  });
  
  test('should extract sender names from email headers', () => {
    // Test different email header formats
    // Test edge cases (no name, special chars)
    // Assert fallback to email username
  });
});
```

### Integration Testing

#### End-to-End Workflow Tests
```typescript
describe('E2E Workflow', () => {
  test('should process complete email flow', async () => {
    // Setup: Create test email with attachment
    // Execute: Run main processing function
    // Verify: File uploaded, labels updated, tracking recorded
    // Cleanup: Remove test data
  });
  
  test('should handle duplicate file prevention', async () => {
    // Setup: Pre-populate uploaded_files tracking
    // Execute: Process same email again
    // Verify: File not re-uploaded, proper logging
  });
  
  test('should skip problematic emails and continue', async () => {
    // Setup: Mix of valid and invalid emails
    // Execute: Run processing
    // Verify: Valid emails processed, invalid skipped, errors logged
  });
});
```

#### KV Storage Integration Tests
```typescript
describe('KV Storage Integration', () => {
  test('should persist and retrieve OAuth tokens', async () => {
    // Test token storage and retrieval
    // Verify encryption/decryption if implemented
    // Assert data integrity
  });
  
  test('should track uploaded files correctly', async () => {
    // Test file tracking operations
    // Verify duplicate detection
    // Assert data consistency
  });
  
  test('should handle KV storage failures', async () => {
    // Mock KV failures
    // Verify fallback behavior
    // Assert error handling
  });
});
```

### Performance Testing

#### Load Testing
- **Test Scenario**: Process 50 emails with multiple attachments each
- **Metrics**: Execution time, memory usage, CPU time
- **Limits**: Stay within CloudFlare Worker constraints (10-50ms CPU time)
- **Tools**: Use Wrangler local testing and CloudFlare dashboard metrics

#### Memory Testing
- **Test Scenario**: Process large attachments (up to 25MB)
- **Metrics**: Peak memory usage, streaming efficiency
- **Limits**: Stay under 128MB memory limit
- **Optimization**: Use streaming for large files

#### API Rate Limit Testing
- **Test Scenario**: Rapid API calls to Gmail/Drive
- **Metrics**: API response times, rate limit handling
- **Verification**: Proper backoff and retry logic
- **Monitoring**: Track API quota usage

### Manual Testing Scenarios

#### Happy Path Testing
1. **Setup Phase**:
   - Deploy worker to staging environment
   - Configure test Gmail account with sample emails
   - Set up test Google Drive folder
   - Initialize KV storage with test data

2. **Execution**:
   - Trigger worker manually
   - Monitor CloudFlare logs in real-time
   - Verify emails processed correctly
   - Check Drive folder structure and files
   - Confirm Gmail labels updated

3. **Validation**:
   - All attachments uploaded with correct names
   - Year folders created appropriately
   - Email labels switched correctly
   - KV tracking data updated
   - No errors in logs

#### Error Scenario Testing
1. **Token Expiry**: Test with expired access token
2. **API Failures**: Mock Gmail/Drive API errors
3. **Network Issues**: Test with simulated timeouts
4. **Invalid Emails**: Test with malformed email data
5. **Storage Failures**: Test KV storage unavailability

#### Edge Case Testing
1. **Large Files**: Test 25MB attachment limit
2. **Special Characters**: Test international characters in filenames
3. **Duplicate Names**: Test filename collision handling
4. **Empty Emails**: Test emails without attachments
5. **Missing Labels**: Test emails without required labels

### Staging Environment Setup

#### Test Data Preparation
```typescript
// Test email scenarios
const testScenarios = [
  {
    name: "Standard Insurance Claim",
    sender: "john.smith@insurance.com",
    subject: "Claim #12345",
    attachments: ["claim_form.pdf", "receipt.jpg"],
    labels: ["insurance claims/todo"]
  },
  {
    name: "Multiple Attachments",
    sender: "jane.doe@client.com", 
    subject: "Medical Bills",
    attachments: ["bill1.pdf", "bill2.pdf", "xray.jpg"],
    labels: ["insurance claims/todo"]
  },
  {
    name: "Special Characters",
    sender: "maría.garcía@cliente.es",
    subject: "Reclamación médica",
    attachments: ["factura_médica.pdf"],
    labels: ["insurance claims/todo"]
  }
];
```

#### Monitoring Setup
- CloudFlare Workers analytics dashboard
- Real-time log streaming during tests
- KV storage browser for data verification
- Google Drive folder monitoring
- Gmail label verification

### Deployment Testing

#### Pre-deployment Checklist
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Environment variables configured
- [ ] KV namespace created and accessible
- [ ] OAuth credentials valid
- [ ] Cron schedule configured correctly

#### Post-deployment Validation
- [ ] Worker deployed successfully
- [ ] Cron trigger registered
- [ ] KV storage accessible
- [ ] Setup endpoint responds correctly
- [ ] Manual trigger works
- [ ] Logs show expected output

#### Rollback Testing
- [ ] Previous version can be quickly restored
- [ ] KV data can be exported/imported
- [ ] OAuth tokens remain valid during rollback
- [ ] No data loss during version switches

### Test Environment Requirements

#### Development Environment
- Node.js 18+ for local development
- Wrangler CLI for local testing
- CloudFlare account with Workers plan
- Test Google account with Gmail/Drive access
- KV namespace for testing

#### CI/CD Pipeline Testing
```yaml
# Example GitHub Actions workflow
name: Test and Deploy
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - run: wrangler dev --test
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: wrangler publish
```

## Migration from Existing Service

### Data Migration
- Export `uploaded_files.json` to KV storage
- Migrate OAuth tokens to KV storage
- Test with existing Gmail labels and Drive folders

### Cutover Plan
1. Deploy CloudFlare Worker
2. Run in parallel with existing service (different schedule)
3. Verify identical behavior
4. Switch DNS/disable old service
5. Monitor for issues

### Rollback Plan
- Keep existing Deno service available
- Can quickly re-enable if CloudFlare version fails
- KV data can be exported back to JSON files if needed
# CloudFlare Workers Gmail Extractor - TODO Checklist

## 📋 Project Setup & Prerequisites

### Environment Setup
- [ ] Install Node.js 18+ for local development
- [ ] Install Wrangler CLI globally: `npm install -g wrangler`
- [ ] Install Git for version control
- [ ] Set up code editor with TypeScript support (VS Code recommended)

### Google Cloud Console Setup
- [ ] Create or select Google Cloud Project
- [ ] Enable Gmail API in API Library
- [ ] Enable Google Drive API in API Library
- [ ] Configure OAuth consent screen
  - [ ] Add application name and description
  - [ ] Add required scopes:
    - `https://www.googleapis.com/auth/gmail.modify`
    - `https://www.googleapis.com/auth/drive.file`
  - [ ] Add test users (if external)
- [ ] Create OAuth 2.0 credentials (Desktop Application type)
- [ ] Download credentials JSON file
- [ ] Note Client ID and Client Secret for environment variables

### CloudFlare Setup
- [ ] Create CloudFlare account
- [ ] Upgrade to Workers Paid plan (required for cron triggers)
- [ ] Create KV namespace for storage
- [ ] Note KV namespace ID for wrangler.toml

### Gmail Setup
- [ ] Verify Gmail labels exist:
  - [ ] "insurance claims/todo" (source label)
  - [ ] "insurance claims/processed" (destination label)
- [ ] Test with sample emails containing attachments
- [ ] Apply "insurance claims/todo" label to test emails

### Google Drive Setup
- [ ] Create or identify root folder for attachments
- [ ] Note folder ID or path for configuration
- [ ] Verify sufficient storage space
- [ ] Test upload permissions

---

## 🚀 Development Implementation

### Step 1: Project Foundation
- [x] Initialize new project directory
- [x] Run Step 1 prompt with LLM
- [x] Verify outputs:
  - [x] `package.json` created with correct dependencies
  - [x] `tsconfig.json` configured for Workers
  - [x] `wrangler.toml` basic configuration
  - [x] Project structure created (`src/`, `tests/`, etc.)
  - [x] Basic worker responds to requests
  - [x] Tests run successfully: `npm test`
  - [x] Local deployment works: `wrangler dev`

### Step 2: Configuration & Environment Setup
- [x] Run Step 2 prompt with LLM
- [x] Verify outputs:
  - [x] `src/config.ts` handles environment variables
  - [x] `src/types/config.ts` defines interfaces
  - [x] `wrangler.toml` updated with KV binding and cron
  - [x] Environment variable validation works
  - [x] Configuration tests pass
  - [x] Worker loads config on startup

### Step 3: KV Storage Service
- [x] Run Step 3 prompt with LLM
- [x] Verify outputs:
  - [x] `src/services/storage.service.ts` created
  - [x] `src/types/storage.ts` defines data interfaces
  - [x] All CRUD operations implemented
  - [x] Error handling for KV failures
  - [x] Comprehensive unit tests pass
  - [x] Storage service integrated into main worker

### Step 4: Authentication Service
- [ ] Run Step 4 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/services/auth.service.ts` created
  - [ ] `src/types/auth.ts` defines auth interfaces
  - [ ] Token refresh logic implemented
  - [ ] OAuth API integration working
  - [ ] Setup endpoint created (`/setup`)
  - [ ] Auth tests pass
  - [ ] Token validation on startup

### Step 5: Utility Functions
- [ ] Run Step 5 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/utils/filename.utils.ts` created
  - [ ] `src/utils/date.utils.ts` created
  - [ ] `src/utils/error.utils.ts` created
  - [ ] `src/types/utils.ts` defines utility types
  - [ ] All utility functions tested
  - [ ] Edge cases handled (international chars, long names, etc.)
  - [ ] Utilities integrated into main worker

### Step 6: Gmail API Service
- [ ] Run Step 6 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/services/gmail.service.ts` created
  - [ ] `src/types/gmail.ts` defines Gmail interfaces
  - [ ] Email search/query implemented
  - [ ] Attachment download working
  - [ ] Label modification working
  - [ ] Gmail API error handling
  - [ ] Service tests pass
  - [ ] Gmail connectivity test in main worker

### Step 7: Google Drive API Service
- [ ] Run Step 7 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/services/drive.service.ts` created
  - [ ] `src/types/drive.ts` defines Drive interfaces
  - [ ] Folder search/creation implemented
  - [ ] File upload with multipart working
  - [ ] Year folder logic working
  - [ ] Drive API error handling
  - [ ] Service tests pass
  - [ ] Drive connectivity test in main worker

### Step 8: Core Email Processing Logic
- [ ] Run Step 8 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/services/processor.service.ts` created
  - [ ] `src/types/processor.ts` defines processing interfaces
  - [ ] Complete workflow orchestration
  - [ ] Error handling for individual emails
  - [ ] Duplicate file prevention
  - [ ] Label management working
  - [ ] Processing status tracking
  - [ ] Processor tests pass with mocked services
  - [ ] Manual trigger endpoint works

### Step 9: Main Worker Integration & Cron Handler
- [ ] Run Step 9 prompt with LLM
- [ ] Verify outputs:
  - [ ] `src/index.ts` fully implemented
  - [ ] Cron handler calls processor service
  - [ ] HTTP endpoints implemented (`/setup`, `/process`, `/status`, `/logs`)
  - [ ] Proper error handling and logging
  - [ ] Integration tests pass
  - [ ] Performance optimizations in place
  - [ ] Final `wrangler.toml` configuration correct

### Step 10: End-to-End Testing & Production Readiness
- [ ] Run Step 10 prompt with LLM
- [ ] Verify outputs:
  - [ ] E2E test suite created
  - [ ] Production deployment scripts
  - [ ] Migration utilities
  - [ ] Monitoring and observability setup
  - [ ] Documentation complete
  - [ ] Security review completed
  - [ ] Performance validation done
  - [ ] Production checklist verified

---

## 🧪 Testing & Quality Assurance

### Unit Testing
- [ ] All services have comprehensive unit tests
- [ ] Utilities have edge case testing
- [ ] Mocking strategy working for external APIs
- [ ] Test coverage above 90%
- [ ] All tests pass: `npm test`

### Integration Testing
- [ ] Service integration tests pass
- [ ] KV storage integration working
- [ ] API service integration verified
- [ ] Error handling integration tested

### End-to-End Testing
- [ ] Complete workflow tested with test accounts
- [ ] OAuth flow working end-to-end
- [ ] File upload and label management verified
- [ ] Error recovery tested
- [ ] Performance within CloudFlare limits

### Manual Testing
- [ ] Test with real Gmail account (non-production)
- [ ] Verify file naming and organization
- [ ] Test duplicate prevention
- [ ] Test error scenarios
- [ ] Verify cron scheduling works

---

## 🚀 Deployment & Configuration

### Development Environment
- [ ] Set up environment variables:
  - [ ] `GOOGLE_CLIENT_ID`
  - [ ] `GOOGLE_CLIENT_SECRET`
  - [ ] `LOG_LEVEL` (optional)
  - [ ] `MAX_EMAILS_PER_RUN` (optional)
  - [ ] `MAX_FILE_SIZE_MB` (optional)

### CloudFlare Configuration
- [ ] Update `wrangler.toml` with:
  - [ ] Correct KV namespace ID
  - [ ] Proper cron schedule (`0 0 * * 0`)
  - [ ] Environment variable references
  - [ ] Compatibility date set

### Initial Deployment
- [ ] Authenticate Wrangler: `wrangler auth login`
- [ ] Deploy to CloudFlare: `wrangler publish`
- [ ] Verify deployment successful
- [ ] Check worker appears in CloudFlare dashboard

### OAuth Setup
- [ ] Call setup endpoint: `GET https://your-worker.workers.dev/setup`
- [ ] Complete OAuth flow in browser
- [ ] Verify tokens stored in KV
- [ ] Test token refresh working

### Production Validation
- [ ] Manual trigger test: `POST https://your-worker.workers.dev/process`
- [ ] Verify status endpoint: `GET https://your-worker.workers.dev/status`
- [ ] Check CloudFlare analytics
- [ ] Monitor worker logs
- [ ] Verify cron schedule active

---

## 📊 Monitoring & Maintenance

### CloudFlare Dashboard Monitoring
- [ ] Set up CloudFlare Workers analytics
- [ ] Monitor execution time and success rate
- [ ] Track KV storage usage
- [ ] Set up alert notifications

### Application Monitoring
- [ ] Monitor processing status in KV
- [ ] Check error logs regularly
- [ ] Verify Gmail and Drive API quotas
- [ ] Monitor file upload success rates

### Regular Maintenance
- [ ] Review error logs weekly
- [ ] Check token refresh status
- [ ] Monitor storage usage
- [ ] Update dependencies quarterly
- [ ] Review and rotate OAuth credentials annually

---

## 🔄 Migration from Existing Service

### Pre-Migration
- [ ] Export data from existing service:
  - [ ] `uploaded_files.json` content
  - [ ] OAuth tokens from `config.json`
  - [ ] Any processing logs
- [ ] Backup current service configuration
- [ ] Document current service behavior

### Migration Process
- [ ] Run migration utilities to transfer data to KV
- [ ] Validate data integrity after migration
- [ ] Run CloudFlare worker in parallel with existing service
- [ ] Compare processing results between services
- [ ] Verify identical behavior for test emails

### Cutover
- [ ] Disable existing service cron job
- [ ] Enable CloudFlare worker cron
- [ ] Monitor first few runs closely
- [ ] Verify continued processing
- [ ] Document any issues and resolutions

### Post-Migration
- [ ] Archive old service code and data
- [ ] Update documentation
- [ ] Notify stakeholders of migration completion
- [ ] Monitor for one week for any issues

---

## 📚 Documentation & Knowledge Transfer

### Technical Documentation
- [ ] API endpoint documentation
- [ ] Configuration reference
- [ ] Troubleshooting guide
- [ ] Architecture overview

### Operational Documentation
- [ ] Deployment procedures
- [ ] Monitoring procedures
- [ ] Emergency procedures
- [ ] Maintenance schedules

### Knowledge Transfer
- [ ] Team training on new system
- [ ] Access credentials distribution
- [ ] Monitoring dashboard access
- [ ] Support procedures documented

---

## ✅ Final Verification Checklist

### Functionality
- [ ] Emails with "insurance claims/todo" label are processed
- [ ] Attachments are downloaded and uploaded to Drive
- [ ] Files are organized in year-based folders
- [ ] Filenames follow MM_Sender_Original.ext format
- [ ] Gmail labels are updated correctly
- [ ] Duplicate files are prevented
- [ ] Processing runs weekly on Sunday midnight UTC

### Reliability
- [ ] Error handling prevents service interruption
- [ ] Failed emails don't stop batch processing
- [ ] Token refresh works automatically
- [ ] Service recovers gracefully from API failures
- [ ] All edge cases are handled

### Performance
- [ ] Processing completes within CloudFlare Worker limits
- [ ] Memory usage stays under 128MB
- [ ] CPU time stays within allocated limits
- [ ] API rate limits are respected
- [ ] Storage usage is reasonable

### Security
- [ ] OAuth tokens are stored securely in KV
- [ ] No sensitive data in logs
- [ ] API credentials are environment variables
- [ ] Error messages don't expose sensitive information
- [ ] Access controls are properly configured

### Monitoring
- [ ] Processing status is tracked
- [ ] Errors are logged with context
- [ ] Success/failure metrics are available
- [ ] Performance metrics are tracked
- [ ] Alerts are configured for failures

---

## 🎯 Success Criteria

**The project is complete when:**
- [ ] All checklist items above are verified ✅
- [ ] Service processes emails automatically every Sunday
- [ ] Files are correctly organized in Google Drive
- [ ] Gmail labels are managed properly
- [ ] No duplicate uploads occur
- [ ] Service handles errors gracefully
- [ ] Monitoring and alerting are functional
- [ ] Documentation is complete and accurate
- [ ] Team is trained on the new system
- [ ] Old service has been successfully decommissioned

**Project Status: 🟡 In Progress / 🟢 Complete**
# CloudFlare Workers Gmail Extractor - Development Blueprint

## Overview
This blueprint breaks down the implementation into small, testable, incremental steps that build upon each other. Each step includes comprehensive testing and integration to ensure no orphaned code.

## High-Level Development Phases

### Phase 1: Foundation & Infrastructure
- Project setup and configuration
- Basic TypeScript structure
- CloudFlare Workers environment

### Phase 2: Storage & Authentication
- KV storage abstraction
- OAuth token management
- Authentication service

### Phase 3: Core Services
- Gmail API service
- Google Drive API service
- File processing utilities

### Phase 4: Main Workflow
- Email processing logic
- Cron scheduler integration
- Error handling

### Phase 5: Testing & Deployment
- End-to-end testing
- Production deployment
- Migration utilities

---

## Iterative Implementation Steps

### Step 1: Project Foundation
**Goal**: Set up basic CloudFlare Workers project with TypeScript and testing infrastructure.

```
Create a new CloudFlare Workers project using TypeScript with the following requirements:

1. Initialize a new project with:
   - TypeScript configuration (target ES2022, strict mode)
   - Wrangler configuration for CloudFlare Workers
   - Basic project structure with src/ directory
   - Package.json with necessary dev dependencies

2. Set up basic testing infrastructure:
   - Jest or Vitest for unit testing
   - Test scripts in package.json
   - Basic test setup file

3. Create initial project structure:
   ```
   src/
   ├── index.ts (main worker entry point)
   ├── types/
   ├── services/
   ├── utils/
   └── config.ts
   ```

4. Implement a basic "Hello World" worker that:
   - Responds to HTTP requests
   - Has a basic cron handler
   - Includes proper TypeScript types

5. Write tests for:
   - Basic request handling
   - Configuration loading
   - TypeScript compilation

6. Ensure the project can be:
   - Built successfully with TypeScript
   - Tested with npm test
   - Deployed locally with wrangler dev

Requirements:
- Use latest CloudFlare Workers TypeScript template
- Include @cloudflare/workers-types
- Set up proper tsconfig.json for Workers environment
- Include basic error handling in main worker
```

### Step 2: Configuration & Environment Setup
**Goal**: Add configuration management and environment variable handling.

```
Building on the previous step, implement configuration management:

1. Create a configuration system in src/config.ts that:
   - Defines all environment variables as TypeScript interfaces
   - Provides type-safe access to environment variables
   - Includes validation for required variables
   - Has default values where appropriate

2. Define environment variables for:
   - GOOGLE_CLIENT_ID (required)
   - GOOGLE_CLIENT_SECRET (required)
   - LOG_LEVEL (optional, default: 'info')
   - MAX_EMAILS_PER_RUN (optional, default: 50)
   - MAX_FILE_SIZE_MB (optional, default: 25)

3. Update wrangler.toml to include:
   - KV namespace binding
   - Cron trigger for Sunday midnight UTC
   - Environment variable placeholders

4. Create type definitions in src/types/config.ts for:
   - Environment variables interface
   - Worker bindings interface
   - Configuration validation types

5. Update the main worker (src/index.ts) to:
   - Load and validate configuration on startup
   - Log configuration status (without sensitive data)
   - Handle missing required environment variables gracefully

6. Write comprehensive tests for:
   - Configuration loading with valid environment variables
   - Error handling for missing required variables
   - Default value assignment
   - Type safety validation

Ensure all tests pass and the worker can still be deployed locally.
```

### Step 3: KV Storage Service
**Goal**: Create a robust KV storage abstraction layer with full testing.

```
Building on the configuration system, implement KV storage service:

1. Create src/services/storage.service.ts with:
   - Generic KV storage interface for type safety
   - Methods for storing and retrieving different data types
   - Error handling for KV operations
   - Proper serialization/deserialization

2. Define storage interfaces in src/types/storage.ts:
   - OAuthTokens interface
   - UploadedFiles type (string array)
   - ErrorLog interface
   - ProcessingStatus interface

3. Implement storage operations for:
   - OAuth tokens (get/set/update)
   - Uploaded files tracking (get/add/check duplicates)
   - Error logging (append errors with timestamps)
   - Processing status (get/set last run info)

4. Add proper error handling for:
   - KV namespace not available
   - Serialization/deserialization errors
   - Network timeouts
   - Storage quota limits

5. Create comprehensive unit tests in tests/services/storage.service.test.ts:
   - Mock KV namespace for testing
   - Test all CRUD operations
   - Test error scenarios
   - Test data serialization/deserialization
   - Test concurrent access scenarios

6. Update main worker to:
   - Initialize storage service
   - Include basic health check for KV connectivity
   - Log storage service status

Ensure storage service is fully tested and integrated into the main worker.
```

### Step 4: Authentication Service
**Goal**: Implement OAuth token management with automatic refresh capabilities.

```
Building on the storage service, create authentication management:

1. Create src/services/auth.service.ts with:
   - OAuth token storage and retrieval
   - Token expiry checking
   - Token refresh logic using Google OAuth API
   - Simplified error handling (no re-auth flags)

2. Define authentication types in src/types/auth.ts:
   - OAuthCredentials interface
   - TokenResponse interface
   - AuthError types

3. Implement authentication methods:
   - getValidToken() - returns valid token or refreshes if needed
   - refreshToken() - calls Google OAuth refresh endpoint
   - isTokenExpired() - checks token expiry timestamp
   - storeTokens() - saves tokens to KV storage

4. Add Google OAuth API integration:
   - Use fetch() for direct REST calls to token endpoint
   - Proper request headers and body formatting
   - Response parsing and error handling
   - Rate limiting respect

5. Create comprehensive tests in tests/services/auth.service.test.ts:
   - Mock Google OAuth API responses
   - Test token refresh scenarios
   - Test expired token handling
   - Test refresh failure scenarios
   - Test storage integration

6. Update main worker to:
   - Initialize auth service
   - Perform basic token validation on startup
   - Log authentication status (without exposing tokens)

7. Create a setup endpoint at /setup that:
   - Handles OAuth flow initialization
   - Stores initial tokens in KV
   - Returns success/failure status

Ensure auth service is fully tested and ready for API integration.
```

### Step 5: Utility Functions
**Goal**: Create file naming, date formatting, and data processing utilities.

```
Create utility functions needed for email and file processing:

1. Create src/utils/filename.utils.ts with:
   - extractSenderInfo() - parse email sender name and email
   - formatSenderName() - sanitize and format sender name
   - formatFilename() - create final filename with MM_Sender_Original.ext pattern
   - sanitizeFilename() - remove invalid characters
   - truncateFilename() - ensure filename length limits

2. Create src/utils/date.utils.ts with:
   - formatMonth() - convert date to MM format
   - formatYear() - convert date to YYYY format
   - parseEmailDate() - parse various email date formats
   - getCurrentTimestamp() - get current timestamp for logging

3. Create src/utils/error.utils.ts with:
   - createErrorLog() - format errors for KV storage
   - isRetryableError() - determine if error should be retried
   - logError() - consistent error logging
   - sanitizeErrorMessage() - remove sensitive data from error messages

4. Define utility types in src/types/utils.ts:
   - SenderInfo interface
   - FileInfo interface
   - ErrorContext interface

5. Write comprehensive tests for all utilities:
   - tests/utils/filename.utils.test.ts
   - tests/utils/date.utils.test.ts
   - tests/utils/error.utils.test.ts

6. Test edge cases:
   - International characters in names
   - Various email header formats
   - Long filenames and truncation
   - Invalid date formats
   - Special characters in sender names

7. Update main worker to:
   - Import and validate utility functions
   - Include utilities in basic integration test

Ensure all utilities are fully tested with edge cases covered.
```

### Step 6: Gmail API Service
**Goal**: Implement Gmail API integration for email queries and label management.

```
Building on auth service and utilities, create Gmail API service:

1. Create src/services/gmail.service.ts with:
   - searchEmails() - query emails with label filter
   - getEmailDetails() - fetch full email including attachments
   - downloadAttachment() - download email attachment
   - updateEmailLabels() - remove/add labels
   - listLabels() - get available labels for validation

2. Define Gmail types in src/types/gmail.ts:
   - EmailMessage interface
   - EmailAttachment interface
   - LabelModification interface
   - GmailApiResponse interfaces

3. Implement API methods using fetch():
   - Proper authentication headers with Bearer tokens
   - Query parameter construction for email search
   - Multipart response handling for attachments
   - Error response parsing and handling

4. Add Gmail-specific error handling:
   - Rate limiting detection and backoff
   - Invalid label errors
   - Attachment download failures
   - Authentication errors

5. Create comprehensive tests in tests/services/gmail.service.test.ts:
   - Mock Gmail API responses
   - Test email querying with different filters
   - Test attachment download scenarios
   - Test label modification operations
   - Test error handling and retries

6. Integration with auth service:
   - Use auth.getValidToken() for all API calls
   - Handle token refresh scenarios
   - Automatic retry on authentication errors

7. Update main worker to:
   - Initialize Gmail service
   - Perform basic Gmail connectivity test
   - Log Gmail service status

Ensure Gmail service is fully tested and integrated with authentication.
```

### Step 7: Google Drive API Service
**Goal**: Implement Google Drive API integration for folder management and file uploads.

```
Building on auth service and utilities, create Google Drive API service:

1. Create src/services/drive.service.ts with:
   - searchFolders() - find existing folders by name and parent
   - createFolder() - create new folders with proper parents
   - uploadFile() - upload files with multipart form data
   - getOrCreateYearFolder() - find or create year-based folders

2. Define Drive types in src/types/drive.ts:
   - DriveFile interface
   - FolderInfo interface
   - UploadRequest interface
   - DriveApiResponse interfaces

3. Implement Drive API methods:
   - Folder search with proper query parameters
   - Folder creation with parent relationships
   - Multipart file upload with metadata
   - Response parsing and error handling

4. Add Drive-specific error handling:
   - Storage quota exceeded
   - Permission denied errors
   - File size limit errors
   - Network timeout handling

5. Create comprehensive tests in tests/services/drive.service.test.ts:
   - Mock Drive API responses
   - Test folder search and creation
   - Test file upload scenarios
   - Test year folder logic
   - Test error handling

6. Integration features:
   - Use auth.getValidToken() for authentication
   - File streaming for large attachments
   - Progress logging for uploads
   - Proper MIME type handling

7. Update main worker to:
   - Initialize Drive service
   - Test Drive connectivity
   - Log Drive service status

Ensure Drive service is fully tested and ready for file operations.
```

### Step 8: Core Email Processing Logic
**Goal**: Implement the main email processing workflow that ties all services together.

```
Building on all previous services, create the core email processing logic:

1. Create src/services/processor.service.ts with:
   - processEmails() - main processing function
   - processEmailAttachments() - handle individual email
   - checkDuplicateFile() - prevent duplicate uploads
   - updateProcessingStatus() - track processing results

2. Implement processing workflow:
   - Query Gmail for emails with "insurance claims/todo" label
   - Filter emails to only those with attachments
   - For each email: extract sender, date, download attachments
   - Generate formatted filenames using utilities
   - Create year folders in Drive if needed
   - Upload attachments to appropriate folders
   - Update Gmail labels (remove todo, add processed)
   - Track uploaded files in KV storage

3. Add robust error handling:
   - Skip problematic emails and continue processing
   - Log errors with context for debugging
   - Update processing status regardless of individual failures
   - Graceful degradation on service failures

4. Create processing types in src/types/processor.ts:
   - ProcessingResult interface
   - EmailProcessingStatus interface
   - BatchProcessingReport interface

5. Write comprehensive tests in tests/services/processor.service.test.ts:
   - Mock all dependent services (Gmail, Drive, Storage, Auth)
   - Test complete processing workflow
   - Test error scenarios and recovery
   - Test duplicate file prevention
   - Test label management
   - Test processing status tracking

6. Integration with existing services:
   - Use Gmail service for email operations
   - Use Drive service for file operations
   - Use Storage service for tracking and status
   - Use Auth service for API authentication
   - Use utilities for filename and date formatting

7. Update main worker to:
   - Initialize processor service
   - Wire processor to cron handler
   - Add manual trigger endpoint for testing

Ensure processor service orchestrates all components correctly.
```

### Step 9: Main Worker Integration & Cron Handler
**Goal**: Complete the main worker with cron scheduling and HTTP endpoints.

```
Complete the main worker implementation by integrating all services:

1. Update src/index.ts to include:
   - Proper service initialization with dependency injection
   - Cron handler that calls the processor service
   - HTTP endpoints for manual triggering and setup
   - Comprehensive error handling and logging
   - Graceful shutdown handling

2. Implement cron handler:
   - Scheduled function that runs every Sunday at midnight UTC
   - Calls processor.processEmails() with error handling
   - Logs execution start/end times
   - Updates processing status in KV storage
   - Handles long-running execution within Worker limits

3. Add HTTP endpoints:
   - GET /setup - OAuth setup flow for initial deployment
   - POST /process - Manual trigger for testing
   - GET /status - Health check and last run status
   - GET /logs - Recent error logs (for debugging)

4. Implement proper logging:
   - Structured logging with timestamps
   - Different log levels (error, warn, info, debug)
   - Context-aware logging with request IDs
   - No sensitive data in logs

5. Add comprehensive error handling:
   - Global error handlers for unhandled exceptions
   - Service-level error recovery
   - Proper HTTP error responses
   - Worker timeout handling

6. Create integration tests in tests/integration/:
   - Test complete cron execution flow
   - Test HTTP endpoint responses
   - Test error scenarios end-to-end
   - Test service integration

7. Performance optimizations:
   - Lazy service initialization
   - Memory-efficient file processing
   - Proper cleanup of temporary data
   - CPU time management for Worker limits

8. Final wrangler.toml configuration:
   - Correct cron schedule (0 0 * * 0)
   - KV namespace binding
   - Environment variable references
   - Proper compatibility settings

Ensure the worker is fully functional and ready for deployment.
```

### Step 10: End-to-End Testing & Production Readiness
**Goal**: Comprehensive testing and production deployment preparation.

```
Finalize the project with comprehensive testing and production setup:

1. Create end-to-end test suite in tests/e2e/:
   - Complete workflow test with real APIs (using test accounts)
   - OAuth flow testing
   - File upload and Gmail label management verification
   - Error recovery and retry logic testing
   - Performance testing within Worker limits

2. Add production deployment scripts:
   - Environment-specific wrangler configurations
   - Deployment validation scripts
   - KV namespace setup automation
   - Environment variable setup documentation

3. Create migration utilities in src/migration/:
   - Export script for existing uploaded_files.json
   - OAuth token migration from existing service
   - Data validation and integrity checks
   - Rollback procedures

4. Add monitoring and observability:
   - CloudFlare Analytics integration
   - Custom metrics for processing success/failure
   - Alert thresholds for error rates
   - Performance monitoring dashboard setup

5. Documentation updates:
   - Deployment guide with step-by-step instructions
   - Troubleshooting guide for common issues
   - API documentation for HTTP endpoints
   - Configuration reference

6. Security review:
   - Token storage security validation
   - API key management best practices
   - Error message sanitization
   - Access control verification

7. Performance validation:
   - Load testing with maximum email volumes
   - Memory usage profiling
   - CPU time optimization verification
   - API rate limiting compliance

8. Production checklist:
   - All tests passing (unit, integration, e2e)
   - Security review completed
   - Performance requirements met
   - Documentation complete
   - Deployment scripts tested
   - Monitoring configured
   - Rollback plan verified

Ensure the project is production-ready with comprehensive testing and documentation.
```

---

## Prompt Sequence Summary

Each prompt builds incrementally:

1. **Foundation** → Basic CloudFlare Workers TypeScript project
2. **Configuration** → Environment variables and type-safe config
3. **Storage** → KV storage abstraction with full testing
4. **Authentication** → OAuth token management
5. **Utilities** → File processing and formatting utilities
6. **Gmail Service** → Email querying and label management
7. **Drive Service** → File upload and folder management
8. **Processing Logic** → Core workflow orchestration
9. **Main Worker** → Cron scheduling and HTTP endpoints
10. **Production** → End-to-end testing and deployment

Each step includes:
- ✅ Comprehensive unit testing
- ✅ Integration with previous components
- ✅ Error handling and edge cases
- ✅ TypeScript type safety
- ✅ No orphaned or unused code
- ✅ Ready for next iteration

This approach ensures safe, incremental development with strong testing at every step.
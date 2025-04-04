# Gmail Attachment Extractor

A Deno script that automatically extracts attachments from Gmail emails with specific labels, saves them to Google Drive, and manages email labels for processing status.

## Features

- Automatic extraction of email attachments
- Organized storage in Google Drive with year-based folders
- Intelligent file naming based on sender and date
- Label management for tracking processed items
- Duplicate prevention with processing history
- Robust error handling and retry logic
- Detailed logging for troubleshooting

## Prerequisites

- [Deno](https://deno.land/) installed on your system
- A Google Cloud Project with Gmail and Drive APIs enabled
- Google Cloud OAuth 2.0 credentials
- Gmail labels set up for processing workflow

## Setup

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Gmail API
   - Google Drive API

### 2. OAuth Consent Screen Setup

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose User Type (Internal or External)
3. Fill in the application details:
   - App name
   - User support email
   - Developer contact information
4. Add the following scopes under "Scopes for Google APIs":
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/drive.file`
5. Add any test users if using External user type

### 3. OAuth Credentials Setup

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Desktop Application" as the application type
4. Set up the OAuth redirect URI:
   - Add `http://localhost:9000/callback` to the Authorized redirect URIs
5. Download the client credentials

### 4. Gmail Label Setup

1. Create two labels in Gmail:
   - Source label (e.g., "* insurance claim")
   - Processed label (e.g., "processed insurance claim")
2. Apply the source label to emails you want to process
3. The script will automatically switch labels after processing

### 5. Initial Authentication

Run the OAuth setup script:

```bash
deno task setup
```

This will:
1. Prompt for your Google Cloud credentials (Client ID and Client Secret)
2. Open a browser for authentication
3. Create a `config.json` file with your access tokens

### 6. Running the Script

Extract attachments using:

```bash
deno task run
```

For development with auto-reload:
```bash
deno task dev
```

Enable verbose logging:
```bash
DEBUG=1 deno task run
```

## File Organization

Files are organized in Google Drive following this structure:
```
OutputFolder/
├── 2023/
│   ├── MM_SendersLastName_OriginalFilename.ext
│   └── ...
└── 2024/
    ├── MM_SendersLastName_OriginalFilename.ext
    └── ...
```

Naming convention:
- MM: Two-digit month
- SendersLastName: Extracted from email sender (max 20 chars)
- OriginalFilename: Sanitized original filename (max 50 chars)
- Total filename length is limited to 100 characters

## Label Management

The script handles Gmail labels in the following way:
1. When processing messages with label "* insurance claim", it will:
   - Remove the original label
   - Add a "processed insurance claim" label
2. Labels must exist before running the script
3. Label modifications include retry logic with exponential backoff
4. Failed label modifications are logged but won't stop processing

### Label Requirements
- Source label (e.g., "* insurance claim") must exist
- Processed label (e.g., "processed insurance claim") must exist
- Labels are case-sensitive

## Progress Tracking

The script maintains a record of processed files in `./data/uploaded_files.json`:
- Prevents duplicate processing of attachments
- Records are stored as `year/filename`
- File can be manually cleared to reprocess attachments

## Project Structure

```
.
├── deno.json           # Task definitions and imports
├── main.ts             # Main script for extracting attachments
├── oauth_setup.ts      # OAuth setup and token generation
├── .gitignore         # Git ignore rules
├── data/              # Data directory
│   ├── config.json    # Generated configuration file
│   └── uploaded_files.json # Processing history
└── temp_attachments/  # Temporary storage (auto-cleaned)
```

## Configuration

### deno.json
```json
{
  "tasks": {
    "dev": "deno run --watch main.ts",
    "setup": "deno run -A oauth_setup.ts",
    "run": "deno run -A main.ts"
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@1",
    "googleapis": "npm:googleapis@129.0.0"
  }
}
```

### config.json (generated)
```json
{
  "credentials": {
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "redirect_uri": "http://localhost:9000/callback"
  },
  "tokens": {
    "access_token": "your_access_token",
    "refresh_token": "your_refresh_token"
  },
  "label": "default_label",
  "outputFolder": "default_folder"
}
```

## Debug Logging

The script provides detailed logging for troubleshooting:
- Permission verification results
- Label modification attempts and results
- File download and upload progress
- Processing status for each email
- Error details with stack traces when available

Enable verbose logging by setting the DEBUG environment variable:
```bash
DEBUG=1 deno task run
```

## Common Issues

### Authentication Issues
- `invalid_client`: Verify OAuth credentials and redirect URI in Google Cloud Console
- `Token expired`: Re-run `deno task setup`
- `redirect_uri_mismatch`: Ensure `http://localhost:9000/callback` is added to Authorized redirect URIs
- `Access denied`: Check if required scopes are added to the OAuth consent screen

### Label Issues
- `Label not found`: Verify both source and processed labels exist
- `Label modification failed`: Check Gmail API quotas and permissions
- `Skipped label removal`: Original label may have been removed manually

### Gmail/Drive Issues
- `Permission denied`: Ensure both Gmail and Drive APIs are enabled
- `Insufficient permission`: Verify OAuth consent screen has the required scopes
- `Quota exceeded`: Check API usage and limits in Google Cloud Console

### File Processing Issues
- `Already uploaded`: Check uploaded_files.json if reprocessing is needed
- `Invalid sender format`: Email sender format may be non-standard
- `Filename too long`: Original filename exceeds length limits

## Token Management

The application includes a robust token management system to handle OAuth authentication with Google's APIs. This system ensures continuous operation without manual intervention when access tokens expire.

### Automatic Token Refresh

- The application automatically refreshes access tokens before they expire
- Tokens are refreshed in several ways:
  - Before making any API calls (proactive check)
  - When a token expiration error is encountered (reactive handling)
  - Through a daily scheduled job (maintenance refresh)
- Token refresh events are logged for troubleshooting

### Token Storage

- Authentication tokens are stored in the `./data/config.json` file by default
- An optional encrypted storage mechanism is available for improved security
- The configuration includes:
  - Access token (short-lived, typically 1 hour)
  - Refresh token (long-lived)
  - Expiration timestamp
  - Re-authentication flag

### Re-Authentication Handling

If a refresh token becomes invalid (revoked, expired, or otherwise unusable), the application will:

1. Set a `needsReauth` flag in the configuration
2. Skip further processing until re-authentication is completed
3. Provide clear instructions for running the setup script
4. Automatically clear the flag once re-authentication is successful

The scheduler checks for the `needsReauth` flag before each execution and will skip processing if re-authentication is required.

### Secure Token Storage

For improved security, tokens can be stored in an encrypted format:

- Token encryption using a local key
- Automatic migration from plaintext to encrypted storage
- Fallback to plaintext if encryption is unavailable

To enable secure token storage, the application will automatically attempt to use it when available. No additional configuration is required.

### Troubleshooting Token Issues

Common token-related issues and solutions:

- **"Token has been expired or revoked"**: Run `deno task setup` to re-authenticate
- **"Invalid client"**: Verify your OAuth credentials in Google Cloud Console
- **"Missing refresh token"**: Ensure the OAuth consent screen is configured with the correct scopes
- **"Access denied"**: Check if the application has the required permissions

For more persistent issues, you can manually clear the configuration:

```bash
rm ./data/config.json ./data/config.encrypted
deno task setup
```

### Token Refresh Schedule

The application includes a scheduled token refresh that runs daily at midnight (Eastern Time) to ensure tokens remain valid even during periods of inactivity.

## Security Notes

- Keep your `config.json` secure and never commit it to version control
- Use environment variables for sensitive information in production
- Regularly rotate OAuth credentials if needed
- The script requests only required permissions:
  - Gmail modify access (for label management)
  - Limited Drive access (only files created by the app)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.
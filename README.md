# Gmail Attachment Extractor

A Deno script that automatically extracts attachments from Gmail emails with specific labels and saves them to Google Drive.

## Prerequisites

- [Deno](https://deno.land/) installed on your system
- A Google Cloud Project with Gmail and Drive APIs enabled
- Google Cloud OAuth 2.0 credentials

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
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.file`
5. Add any test users if using External user type

### 3. OAuth Credentials Setup

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Desktop Application" as the application type
4. Set up the OAuth redirect URI:
   - Add `http://localhost:9000/callback` to the Authorized redirect URIs
5. Download the client credentials

### 4. Initial Authentication

Run the OAuth setup script:

```bash
deno task setup
```

This will:
1. Prompt for your Google Cloud credentials (Client ID and Client Secret)
2. Open a browser for authentication
3. Create a `config.json` file with your access tokens

### 5. Running the Script

Extract attachments using:

```bash
deno task run
```

For development with auto-reload:
```bash
deno task dev
```

## Project Structure

```
.
├── deno.json         # Task definitions and imports
├── main.ts           # Main script for extracting attachments
├── oauth_setup.ts    # OAuth setup and token generation
├── .gitignore       # Git ignore rules
└── config.json       # Generated configuration file (git-ignored)
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

## Common Issues

### Authentication Issues
- `invalid_client`: Verify OAuth credentials and redirect URI in Google Cloud Console
- `Token expired`: Re-run `deno task setup`
- `redirect_uri_mismatch`: Ensure `http://localhost:9000/callback` is added to Authorized redirect URIs
- `Access denied`: Check if required scopes are added to the OAuth consent screen

### Gmail/Drive Issues
- `Label not found`: Verify the label exists in your Gmail account
- `Permission denied`: Ensure both Gmail and Drive APIs are enabled
- `Insufficient permission`: Verify OAuth consent screen has the required scopes

## Security Notes

- Keep your `config.json` secure and never commit it to version control
- Use environment variables for sensitive information in production
- Regularly rotate OAuth credentials if needed
- The script only requests minimal required permissions:
  - Read-only access to Gmail
  - Limited Drive access (only files created by the app)

## License

This project is licensed under the MIT License.
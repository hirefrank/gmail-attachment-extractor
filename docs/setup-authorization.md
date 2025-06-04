# Setup Endpoint Authorization

## Overview
The `/setup` endpoint is now protected with Bearer token authentication to prevent unauthorized access to the OAuth flow.

## Configuration

### 1. Set the Environment Variable
Add the `SETUP_AUTH_TOKEN` environment variable to your CloudFlare Worker:

```bash
# Using wrangler CLI
wrangler secret put SETUP_AUTH_TOKEN

# Enter a secure token when prompted (e.g., generate with: openssl rand -base64 32)
```

### 2. Local Development
For local development, add to your `.dev.vars` file:
```
SETUP_AUTH_TOKEN=your-secure-token-here
```

## Usage

### Accessing the Setup Page
When `SETUP_AUTH_TOKEN` is configured, you must provide the token in the Authorization header:

```bash
# Using curl
curl -H "Authorization: Bearer your-secure-token-here" https://your-worker.workers.dev/setup

# Using browser (more complex)
# You'll need a browser extension like ModHeader to add the Authorization header
```

### Programmatic Access
```javascript
// Example JavaScript
const response = await fetch('https://your-worker.workers.dev/setup', {
  headers: {
    'Authorization': 'Bearer your-secure-token-here'
  }
});
```

### OAuth Callback
The OAuth callback (when returning from Google) does NOT require authorization, so the flow works seamlessly.

## Security Notes

1. **Token Generation**: Use a strong, random token:
   ```bash
   openssl rand -base64 32
   ```

2. **Token Storage**: Store the token securely and never commit it to version control

3. **Optional Protection**: If `SETUP_AUTH_TOKEN` is not set, the endpoint remains unprotected (for backward compatibility)

4. **Single User**: This mechanism is designed for single-user protection. For multi-user scenarios, consider a more robust authentication system.

## Alternative Approaches

### 1. IP Allowlist (CloudFlare Access)
Use CloudFlare Access to restrict the endpoint to specific IP addresses or authenticated users.

### 2. Query Parameter Token
Less secure but easier for browser access:
```javascript
// Add to handleOAuthSetup function
const queryToken = url.searchParams.get('auth');
if (queryToken !== config.setupAuthToken) {
  // Unauthorized
}
```

### 3. Time-Limited Setup
Automatically disable setup after first use or after a time period:
```javascript
// Check if already configured
const tokens = await auth.validateTokens();
if (tokens.hasTokens) {
  // Block access if already set up
}
```
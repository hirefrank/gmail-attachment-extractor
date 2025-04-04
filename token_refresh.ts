/**
 * Standalone token refresh utility
 *
 * Run with: deno task refresh
 *
 * This script can be used to manually refresh tokens or to diagnose token issues.
 */

import { google } from "googleapis";
import { loadConfigSecurely, saveConfigSecurely } from "./token_security.ts";

// Load config from file - try secure first, then plaintext
async function loadConfig() {
  try {
    // Try secure storage first
    try {
      const config = await loadConfigSecurely();
      console.log('Configuration loaded securely');
      return config;
    } catch (secureError) {
      console.warn('Could not load secure config, trying plaintext:', secureError);

      // Fall back to plaintext config
      const configText = await Deno.readTextFile("./data/config.json");
      const config = JSON.parse(configText);
      console.log('Configuration loaded from plaintext file');
      return config;
    }
  } catch (error) {
    console.error("Error loading config. Have you run the OAuth setup script?");
    throw error;
  }
}

// Save updated config - try secure first, then plaintext
// deno-lint-ignore no-explicit-any
async function saveConfig(config: any) {
  try {
    // Try secure storage first
    try {
      await saveConfigSecurely(config);
      console.log('Updated tokens saved securely');
    } catch (secureError) {
      console.warn('Could not save securely, falling back to plaintext:', secureError);

      // Fall back to plaintext
      await Deno.writeTextFile(
        './data/config.json',
        JSON.stringify(config, null, 2)
      );
      console.log('Updated tokens saved to plaintext config.json');
    }
  } catch (error) {
    console.error('Error saving updated tokens:', error);
    throw error;
  }
}

// Main function to refresh the token
async function refreshToken() {
  console.log('\nStarting token refresh utility...');

  try {
    // Load the config
    // deno-lint-ignore no-explicit-any
    const config = await loadConfig() as any;
    console.log('\nCurrent token status:');
    console.log('- Access token present:', !!config.tokens.access_token);
    console.log('- Refresh token present:', !!config.tokens.refresh_token);

    if (config.tokens.expiry_date) {
      const expiryDate = new Date(config.tokens.expiry_date);
      const now = new Date();
      const isExpired = expiryDate <= now;

      console.log(`- Expiry date: ${expiryDate.toLocaleString()}`);
      console.log(`- Status: ${isExpired ? 'EXPIRED' : 'Valid'}`);

      if (!isExpired) {
        const timeLeft = Math.floor((expiryDate.getTime() - now.getTime()) / 1000 / 60);
        console.log(`- Time remaining: ~${timeLeft} minutes`);
      }
    } else {
      console.log('- No expiry date found');
    }

    console.log('\nAttempting to refresh token...');

    // Create an OAuth client
    const auth = new google.auth.OAuth2(
      config.credentials.client_id,
      config.credentials.client_secret,
      config.credentials.redirect_uri
    );

    // Set the credentials with the refresh token
    auth.setCredentials({
      refresh_token: config.tokens.refresh_token,
      expiry_date: Date.now() + 3600 * 1000 // Set expiry to 1 hour from now
    });

    // Register token event handler
    auth.on('tokens', (tokens) => {
      console.log('Received new tokens from Google OAuth API');

      if (tokens.access_token) {
        config.tokens.access_token = tokens.access_token;
        console.log('- New access token received');
      }

      if (tokens.refresh_token) {
        config.tokens.refresh_token = tokens.refresh_token;
        console.log('- New refresh token received');
      }

      if (tokens.expiry_date) {
        config.tokens.expiry_date = tokens.expiry_date;
        console.log(`- New expiry date: ${new Date(tokens.expiry_date).toLocaleString()}`);
      }
    });

    // Force a token refresh
    const { token } = await auth.getAccessToken();

    if (!token) {
      throw new Error('Failed to refresh access token');
    }

    // Update the config
    config.tokens.access_token = token;

    // Clear any reauth flag
    config.tokens.needsReauth = false;

    // Save the updated config
    await saveConfig(config);

    console.log('\nToken refresh successful!');
    console.log('Updated token status:');
    console.log('- Access token present:', !!config.tokens.access_token);
    console.log('- Refresh token present:', !!config.tokens.refresh_token);

    if (config.tokens.expiry_date) {
      const expiryDate = new Date(config.tokens.expiry_date);
      console.log(`- New expiry date: ${expiryDate.toLocaleString()}`);

      const timeLeft = Math.floor((expiryDate.getTime() - Date.now()) / 1000 / 60);
      console.log(`- Time remaining: ~${timeLeft} minutes`);
    }

    console.log('\nVerifying token with a test API call...');

    // Create Gmail API client with the refreshed token
    const gmail = google.gmail({ version: "v1", auth });

    // Make a simple API call to verify the token
    try {
      const response = await gmail.users.labels.list({ userId: 'me' });
      console.log(`- API call successful! Found ${response.data.labels?.length || 0} labels.`);
      console.log('- The token is working correctly.');
    } catch (apiError) {
      console.error('- API call failed:', apiError);
      console.error('- The token may not be working correctly.');
      throw apiError;
    }

  } catch (error) {
    console.error('\nToken refresh failed:', error);
    console.log('\nIf the refresh token is invalid or expired, you need to re-authenticate:');
    console.log('1. Run "deno task setup"');
    console.log('2. Follow the browser authentication flow');
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await refreshToken();
}
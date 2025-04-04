import { main } from "./main.ts";
import { Cron } from "croner";

// Function to check if re-authentication is needed
async function checkNeedsReauth(): Promise<boolean> {
  try {
    const configText = await Deno.readTextFile("./data/config.json");
    const config = JSON.parse(configText);

    return config.tokens?.needsReauth === true;
  } catch (error) {
    console.error('Error checking if re-auth is needed:', error);
    return false;
  }
}

// Add a function to clear the re-auth flag after successful execution
async function clearReauthFlag(): Promise<void> {
  try {
    const configText = await Deno.readTextFile("./data/config.json");
    const config = JSON.parse(configText);

    if (config.tokens?.needsReauth) {
      config.tokens.needsReauth = false;
      await Deno.writeTextFile("./data/config.json", JSON.stringify(config, null, 2));
      console.log('Cleared re-auth flag after successful execution');
    }
  } catch (error) {
    console.error('Error clearing re-auth flag:', error);
  }
}

// Execute main with error handling and re-auth check
async function executeMain(): Promise<void> {
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  try {
    // Check if re-auth is needed before trying to run
    const needsReauth = await checkNeedsReauth();
    if (needsReauth) {
      console.log(`[${timestamp}] Re-authentication required. Skipping execution.`);
      console.log('Please run "deno task setup" to re-authenticate.');
      return;
    }

    await main();
    console.log(`[${timestamp}] Gmail extractor cron job executed successfully`);

    // If execution was successful, clear any re-auth flag that might have been set
    await clearReauthFlag();
  } catch (error) {
    console.error(`[${timestamp}] Gmail extractor cron job failed:`, error);

    // Check if the error is related to authentication
    if (error instanceof Error &&
        (error.message.includes('token') ||
         error.message.includes('auth') ||
         error.message.includes('credential'))) {
      console.log('The error appears to be authentication-related. You may need to re-authenticate.');
    }
  }
}

await console.log("Setting up the cronjobs...");

// Run every hour
new Cron("0 * * * *", { timezone: "America/New_York" }, executeMain);

// Add a daily job specifically to try to refresh tokens proactively
// This helps keep tokens fresh even when the main job isn't running frequently
new Cron("0 0 * * *", { timezone: "America/New_York" }, async () => {
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });

  console.log(`[${timestamp}] Running daily token refresh...`);

  try {
    // Load the configuration
    const configText = await Deno.readTextFile("./data/config.json");
    const config = JSON.parse(configText);

    // Create a temporary auth client just to refresh the token
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2(
      config.credentials.client_id,
      config.credentials.client_secret,
      config.credentials.redirect_uri
    );

    auth.setCredentials({
      refresh_token: config.tokens.refresh_token,
      expiry_date: Date.now() + 3600 * 1000 // Set expiry to 1 hour from now
    });

    // Force a token refresh
    const { token } = await auth.getAccessToken();

    if (token) {
      console.log(`[${timestamp}] Successfully refreshed access token`);

      // Update the config with the new token
      config.tokens.access_token = token;

      // Clear any re-auth flag
      config.tokens.needsReauth = false;

      // Save the updated config
      await Deno.writeTextFile("./data/config.json", JSON.stringify(config, null, 2));
      console.log(`[${timestamp}] Updated configuration with new token`);
    }
  } catch (error) {
    console.error(`[${timestamp}] Token refresh job failed:`, error);

    // If refresh failed, we might need to re-authenticate
    try {
      const configText = await Deno.readTextFile("./data/config.json");
      const config = JSON.parse(configText);

      config.tokens.needsReauth = true;
      await Deno.writeTextFile("./data/config.json", JSON.stringify(config, null, 2));
      console.log(`[${timestamp}] Set re-auth flag due to token refresh failure`);
    } catch (configError) {
      console.error(`[${timestamp}] Failed to set re-auth flag:`, configError);
    }
  }
});

// Run immediately on startup
await executeMain();

console.log("Scheduler is running. Press Ctrl+C to exit.");
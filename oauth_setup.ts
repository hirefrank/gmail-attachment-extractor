import { google } from "googleapis";
import { serve } from "server";
import { open } from "open";

const PORT = 9000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file'
];

async function getTokens(clientId: string, clientSecret: string): Promise<void> {
  console.log('Setting up OAuth2 client...');

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent' // Force the consent screen to appear, which ensures we get a refresh token
  });

  console.log('\nOpening browser for authentication...');
  await open(authUrl);

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        console.error('No authorization code received');
        return new Response('No code provided', { status: 400 });
      }

      try {
        console.log('\nGetting tokens from authorization code...');
        const { tokens } = await oAuth2Client.getToken(code);

        if (!tokens.access_token || !tokens.refresh_token) {
          throw new Error('Failed to receive required tokens');
        }

        const configObject = {
          credentials: {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI
          },
          tokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000, // Default to 1 hour if not provided
            needsReauth: false
          }
        };

        console.log('\nVerifying token structure...');
        console.log('Access Token:', tokens.access_token ? 'Present' : 'Missing');
        console.log('Refresh Token:', tokens.refresh_token ? 'Present' : 'Missing');
        console.log('Expiry Date:', configObject.tokens.expiry_date
          ? new Date(configObject.tokens.expiry_date).toLocaleString()
          : 'Not provided');

        await Deno.writeTextFile(
          './data/config.json',
          JSON.stringify(configObject, null, 2)
        );

        console.log('\nConfiguration saved to data/config.json');
        console.log('Verifying config file...');

        // Verify the saved config
        const savedConfig = JSON.parse(await Deno.readTextFile('./data/config.json'));
        console.log('Config verification:',
          savedConfig.credentials &&
          savedConfig.tokens &&
          savedConfig.tokens.access_token &&
          savedConfig.tokens.refresh_token ? 'Success' : 'Failed'
        );

        console.log('\nYou can now close this browser window.');

        setTimeout(() => {
          Deno.exit(0);
        }, 1000);

        return new Response(
          'Authentication successful! You can close this window.',
          { status: 200 }
        );
      } catch (error) {
        console.error('\nError during token retrieval:', error);
        return new Response(
          'Error getting tokens. Check console for details.',
          { status: 500 }
        );
      }
    }

    return new Response('Not found', { status: 404 });
  };

  console.log(`\nWaiting for authentication callback on port ${PORT}...`);
  await serve(handler, { port: PORT });
}

console.log('Starting OAuth setup...');

// Ensure data directory exists
try {
  await Deno.mkdir('./data', { recursive: true });
  console.log('Ensured data directory exists');
} catch (error) {
  // Directory already exists or other error
  if (!(error instanceof Deno.errors.AlreadyExists)) {
    console.error('Error creating data directory:', error);
  }
}

// Get credentials from environment or prompt
const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || prompt("Enter your Google Client ID:");
const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || prompt("Enter your Google Client Secret:");

if (!clientId || !clientSecret) {
  console.error("Client ID and Client Secret are required!");
  Deno.exit(1);
}

try {
  await getTokens(clientId, clientSecret);
} catch (error) {
  console.error("\nError during OAuth setup:", error);
  Deno.exit(1);
}
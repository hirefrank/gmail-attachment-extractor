/**
 * Gmail Attachment Extractor - CloudFlare Worker
 * 
 * This worker automatically extracts attachments from Gmail emails with specific labels,
 * uploads them to Google Drive, and manages email labels for processing status.
 */

import { CONFIG, loadConfiguration, logConfigurationStatus, ConfigurationError, type ValidatedConfig } from './config';
import type { Env, RequestContext } from './types';
import { StorageService } from './services/storage.service';
import { StorageError } from './types/storage';
import { AuthService } from './services/auth.service';
import { AuthError } from './types/auth';

// Import utility functions for validation
import { extractSenderInfo, formatFilename } from './utils/filename.utils';
import { parseEmailDate, formatDuration } from './utils/date.utils';
import { createErrorLog, isRetryableError } from './utils/error.utils';

// Import Gmail service
import { GmailService } from './services/gmail.service';
import type { GmailServiceConfig } from './types/gmail';

// Import Drive service
import { DriveService } from './services/drive.service';
import type { DriveServiceConfig } from './types/drive';

// Logger utility for consistent logging
class Logger {
  private logLevel: string;
  
  constructor(logLevel: string = 'info') {
    this.logLevel = logLevel.toLowerCase();
  }
  
  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }
  
  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  }
  
  warn(message: string) {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`);
    }
  }
  
  info(message: string) {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`);
    }
  }
  
  debug(message: string) {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

// Global configuration and service holders
let globalConfig: ValidatedConfig | null = null;
let storageService: StorageService | null = null;
let authService: AuthService | null = null;

// Main worker export
export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let config: ValidatedConfig;
    let logger: Logger;
    
    try {
      // Load and validate configuration
      config = loadConfiguration(env);
      logger = new Logger(config.logLevel);
      
      // Store config globally for other handlers
      globalConfig = config;
      
      // Initialize services
      storageService = new StorageService(env.STORAGE);
      authService = new AuthService(storageService, config.googleClientId, config.googleClientSecret);
      
      // Log configuration on first request
      if (new URL(request.url).pathname === '/health') {
        logConfigurationStatus(config, logger);
        logger.info('Storage service initialized');
        logger.info('Authentication service initialized');
        
        // Validate utility functions on health check
        logger.debug('Validating utility functions...');
        const testDate = parseEmailDate('2024-01-01');
        const testSender = extractSenderInfo('test@example.com');
        const testError = createErrorLog(new Error('test'));
        const testFilename = formatFilename('01', 'Test', 'file.pdf');
        const testDuration = formatDuration(1500);
        const testRetryable = isRetryableError(new Error('network timeout'));
        
        if (testDate && testSender && testError && testFilename && testDuration && typeof testRetryable === 'boolean') {
          logger.debug('Utility functions validated successfully');
        }
        
        // Initialize Gmail service for validation
        const gmailConfig: GmailServiceConfig = {
          maxAttachmentSize: config.maxAttachmentSize,
          requiredLabel: config.requiredLabel,
          processedLabel: config.processedLabel,
          errorLabel: config.errorLabel
        };
        const gmailService = new GmailService(gmailConfig, logger);
        logger.debug('Gmail service initialized successfully');
        
        // Initialize Drive service for validation
        const driveConfig: DriveServiceConfig = {
          rootFolderId: config.driveFolderId,
          maxFileSize: config.maxAttachmentSize,
          defaultMimeType: 'application/octet-stream'
        };
        const driveService = new DriveService(driveConfig, logger);
        logger.debug('Drive service initialized successfully');
      }
    } catch (error) {
      // Handle configuration errors before logger is available
      console.error('[ERROR] Configuration loading failed:', error);
      if (error instanceof ConfigurationError) {
        return new Response(`Configuration Error: ${error.message}`, { 
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      return new Response('Internal server error', { status: 500 });
    }
    
    try {
      const url = new URL(request.url);
      
      // Route handling
      switch (url.pathname) {
        case '/':
          return new Response('Gmail Attachment Extractor - CloudFlare Worker', {
            headers: { 'Content-Type': 'text/plain' }
          });
          
        case '/health':
          return await handleHealthCheck(env, logger);
          
        case '/setup':
          // OAuth setup endpoint
          return await handleOAuthSetup(request, authService!, logger);
          
        case '/process':
          // Manual trigger endpoint (to be implemented)
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          return new Response('Manual processing endpoint - Coming soon', {
            status: 501,
            headers: { 'Content-Type': 'text/plain' }
          });
          
        case '/status':
          // Status endpoint
          return await handleStatus(storageService!, logger);
          
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      logger.error('Request handler error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },
  
  // Cron handler for scheduled execution
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    let config: ValidatedConfig;
    let logger: Logger;
    let gmailService: GmailService;
    let driveService: DriveService;
    
    try {
      // Load and validate configuration
      config = loadConfiguration(env);
      logger = new Logger(config.logLevel);
      globalConfig = config;
      
      // Initialize services
      storageService = new StorageService(env.STORAGE);
      authService = new AuthService(storageService, config.googleClientId, config.googleClientSecret);
      
      // Initialize Gmail service
      const gmailConfig: GmailServiceConfig = {
        maxAttachmentSize: config.maxAttachmentSize,
        requiredLabel: config.requiredLabel,
        processedLabel: config.processedLabel,
        errorLabel: config.errorLabel
      };
      gmailService = new GmailService(gmailConfig, logger);
      
      // Initialize Drive service
      const driveConfig: DriveServiceConfig = {
        rootFolderId: config.driveFolderId,
        maxFileSize: config.maxAttachmentSize,
        defaultMimeType: 'application/octet-stream'
      };
      driveService = new DriveService(driveConfig, logger);
      
      logConfigurationStatus(config, logger);
      logger.info('Storage service initialized for scheduled execution');
      logger.info('Authentication service initialized for scheduled execution');
      logger.info('Gmail service initialized for scheduled execution');
      logger.info('Drive service initialized for scheduled execution');
      
      // Validate tokens
      const tokenStatus = await authService.validateTokens();
      if (!tokenStatus.hasTokens) {
        throw new Error('No OAuth tokens found. Please complete setup at /setup endpoint.');
      }
      if (tokenStatus.isExpired) {
        logger.info('OAuth token expired, refreshing...');
        await authService.getValidToken(); // This will refresh automatically
      } else {
        logger.info(`OAuth token valid, expires in ${tokenStatus.expiresIn} seconds`);
      }
    } catch (error) {
      console.error('[ERROR] Configuration loading failed in scheduled handler:', error);
      // Store error in KV for monitoring
      if (env.STORAGE) {
        await env.STORAGE.put('last_cron_error', JSON.stringify({
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }));
      }
      return;
    }
    
    logger.info(`Scheduled execution started at ${new Date().toISOString()}`);
    
    try {
      
      // Main processing logic
      logger.info('Processing emails...');
      logger.info(`Processing up to ${config.maxEmailsPerRun} emails with max file size ${config.maxFileSizeMB}MB`);
      
      // Get valid access token
      const accessToken = await authService.getValidToken();
      
      // Get label ID for required label
      const labelId = await gmailService.getLabelIdByName(accessToken, config.requiredLabel);
      if (!labelId) {
        throw new Error(`Required label '${config.requiredLabel}' not found in Gmail account`);
      }
      
      // Search for emails with the required label
      const query = gmailService.buildLabelQuery(labelId);
      const emails = await gmailService.searchEmails(accessToken, {
        query,
        maxResults: config.maxEmailsPerRun
      });
      
      logger.info(`Found ${emails.length} emails to process`);
      
      // TODO: Process each email (will be implemented in Step 8)
      
      logger.info('Scheduled execution completed successfully');
    } catch (error) {
      logger.error('Scheduled execution failed:', error);
      // Store error in KV for monitoring
      await env.STORAGE.put('last_cron_error', JSON.stringify({
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }
};

// Health check handler
async function handleHealthCheck(env: Env, logger: Logger): Promise<Response> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      configuration: false,
      environment: false,
      storage: false,
      storageService: false
    }
  };
  
  // Check configuration validity
  try {
    const config = loadConfiguration(env);
    health.checks.configuration = true;
    health.checks.environment = true;
  } catch (error) {
    logger.error('Health check configuration validation failed:', error);
    health.checks.configuration = false;
    health.checks.environment = false;
  }
  
  // Check KV storage connectivity
  try {
    await env.STORAGE.put('health_check', new Date().toISOString(), { expirationTtl: 60 });
    await env.STORAGE.get('health_check');
    health.checks.storage = true;
  } catch (error) {
    logger.error('KV storage health check failed:', error);
    health.checks.storage = false;
  }
  
  // Check storage service health
  try {
    const service = storageService || new StorageService(env.STORAGE);
    health.checks.storageService = await service.isHealthy();
  } catch (error) {
    logger.error('Storage service health check failed:', error);
    health.checks.storageService = false;
  }
  
  // Determine overall health status
  if (!health.checks.configuration || !health.checks.environment || !health.checks.storage || !health.checks.storageService) {
    health.status = 'unhealthy';
  }
  
  return new Response(JSON.stringify(health, null, 2), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Status handler
async function handleStatus(storage: StorageService, logger: Logger): Promise<Response> {
  try {
    const [lastRun, processingStatus, recentErrors] = await Promise.all([
      storage.getLastRunTime(),
      storage.getProcessingStatus(),
      storage.getErrorLogs(10)
    ]);
    
    const status = {
      lastRun: lastRun || 'Never',
      lastStatus: processingStatus || null,
      recentErrors: recentErrors.length,
      storageHealth: await storage.isHealthy()
    };
    
    return new Response(JSON.stringify(status, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Status handler error:', error);
    return new Response('Error retrieving status', { status: 500 });
  }
}

// OAuth setup handler
async function handleOAuthSetup(request: Request, auth: AuthService, logger: Logger): Promise<Response> {
  const url = new URL(request.url);
  
  // Handle OAuth callback
  if (url.searchParams.has('code')) {
    try {
      const code = url.searchParams.get('code')!;
      const error = url.searchParams.get('error');
      
      if (error) {
        return new Response(`OAuth error: ${error} - ${url.searchParams.get('error_description') || 'Unknown error'}`, {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Exchange code for tokens
      const redirectUri = `${url.origin}/setup`;
      await auth.exchangeCodeForTokens(code, redirectUri);
      
      logger.info('OAuth setup completed successfully');
      
      return new Response(`
        <html>
          <head>
            <title>OAuth Setup Complete</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .success { color: green; }
              .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
              code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; }
            </style>
          </head>
          <body>
            <h1 class="success">✓ OAuth Setup Complete</h1>
            <p>Your Gmail Attachment Extractor has been successfully authorized.</p>
            <div class="info">
              <h3>Next Steps:</h3>
              <ul>
                <li>The worker will automatically process emails every Sunday at midnight UTC</li>
                <li>You can trigger manual processing by making a POST request to <code>/process</code></li>
                <li>Check the current status at <code>/status</code></li>
                <li>Monitor health at <code>/health</code></li>
              </ul>
            </div>
            <p>You can close this window.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      logger.error('OAuth setup failed:', error);
      
      let errorMessage = 'OAuth setup failed: ';
      if (error instanceof AuthError) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error';
      }
      
      return new Response(errorMessage, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
  
  // Show OAuth initialization page
  try {
    const tokenStatus = await auth.validateTokens();
    
    if (tokenStatus.hasTokens && !tokenStatus.isExpired) {
      return new Response(`
        <html>
          <head>
            <title>OAuth Already Configured</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .warning { color: orange; }
            </style>
          </head>
          <body>
            <h1>OAuth Already Configured</h1>
            <p>Your Gmail Attachment Extractor is already authorized and ready to use.</p>
            <div class="info">
              <p><strong>Token Status:</strong></p>
              <ul>
                <li>Token expires in: ${Math.floor(tokenStatus.expiresIn! / 60)} minutes</li>
                <li>Automatic refresh: Enabled</li>
              </ul>
            </div>
            <p class="warning">⚠️ To re-authorize, you'll need to clear existing tokens first.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Generate authorization URL
    const redirectUri = `${url.origin}/setup`;
    const authUrl = auth.getAuthorizationUrl(redirectUri);
    
    return new Response(`
      <html>
        <head>
          <title>OAuth Setup - Gmail Attachment Extractor</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background: #4285f4; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
            }
            .button:hover { background: #357ae8; }
            .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .warning { color: #d93025; }
          </style>
        </head>
        <body>
          <h1>OAuth Setup - Gmail Attachment Extractor</h1>
          <p>To use this service, you need to authorize access to your Gmail and Google Drive.</p>
          
          <div class="info">
            <h3>Permissions Required:</h3>
            <ul>
              <li><strong>Gmail:</strong> Read and modify messages and labels</li>
              <li><strong>Google Drive:</strong> Create and manage files created by this app</li>
            </ul>
          </div>
          
          <p>Click the button below to begin the authorization process:</p>
          
          <a href="${authUrl}" class="button">Authorize with Google</a>
          
          <p class="warning">⚠️ Make sure you trust this application before proceeding.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    logger.error('Failed to generate OAuth setup page:', error);
    return new Response('Failed to initialize OAuth setup', { status: 500 });
  }
}
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

// Import Processor service
import { ProcessorService } from './services/processor.service';
import type { ProcessorConfig } from './types/processor';

// Logger utility for consistent logging with request context
class Logger {
  private logLevel: string;
  private requestId?: string;

  constructor(logLevel: string = 'info', requestId?: string) {
    this.logLevel = logLevel.toLowerCase();
    this.requestId = requestId;
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    const requestIdPart = this.requestId ? ` [${this.requestId}]` : '';
    return `[${timestamp}] [${level.toUpperCase()}]${requestIdPart} ${message}`;
  }

  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      const formattedMessage = this.formatMessage('error', message);
      if (error instanceof Error) {
        console.error(formattedMessage, { error: error.message, stack: error.stack });
      } else {
        console.error(formattedMessage, error || '');
      }
    }
  }

  warn(message: string) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message));
    }
  }

  info(message: string) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message));
    }
  }

  debug(message: string) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message));
    }
  }
}

// Global configuration and service holders with lazy initialization
let globalConfig: ValidatedConfig | null = null;
let globalStorageService: StorageService | null = null;
let globalAuthService: AuthService | null = null;

// Generate request ID for tracking
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Lazy service initialization
function getOrCreateStorageService(env: Env): StorageService {
  if (!globalStorageService) {
    globalStorageService = new StorageService(env.STORAGE);
  }
  return globalStorageService;
}

function getOrCreateAuthService(env: Env, config: ValidatedConfig): AuthService {
  if (!globalAuthService) {
    const storage = getOrCreateStorageService(env);
    globalAuthService = new AuthService(storage, config.googleClientId, config.googleClientSecret);
  }
  return globalAuthService;
}

// Main worker export
export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = generateRequestId();
    let config: ValidatedConfig;
    let logger: Logger;

    try {
      // Load and validate configuration
      config = loadConfiguration(env);
      logger = new Logger(config.logLevel, requestId);

      // Store config globally for other handlers
      globalConfig = config;

      logger.debug(`Processing ${request.method} request to ${new URL(request.url).pathname}`);

      // Services are initialized lazily when needed

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

      // Check debug mode for all endpoints except root
      if (url.pathname !== '/' && !config.debugMode) {
        logger.warn(`Access denied to ${url.pathname} - debug mode is disabled`);
        return new Response('Not found', { status: 404 });
      }

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
          return await handleOAuthSetup(request, getOrCreateAuthService(env, config), logger);

        case '/process':
          // Manual trigger endpoint
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          return await handleManualProcess(env, config, logger);

        case '/status':
          // Status endpoint
          return await handleStatus(getOrCreateStorageService(env), logger);

        case '/logs':
          // Error logs endpoint
          return await handleErrorLogs(getOrCreateStorageService(env), logger);

        case '/debug-labels':
          // Debug endpoint to check labels
          return await handleDebugLabels(env, config, logger);

        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      logger.error('Request handler error:', error);

      // Store critical errors in KV
      try {
        const storage = getOrCreateStorageService(env);
        await storage.appendErrorLog({
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          context: `HTTP ${request.method} ${new URL(request.url).pathname} [${requestId}]`,
          stack: error instanceof Error ? error.stack : undefined,
          service: 'http',
          operation: 'fetch'
        });
      } catch (logError) {
        // Ignore logging errors
      }

      return new Response(JSON.stringify({
        error: 'Internal server error',
        requestId,
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // Cron handler for scheduled execution
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const executionId = `cron_${Date.now()}`;
    let config: ValidatedConfig;
    let logger: Logger;
    let storageService: StorageService;
    let authService: AuthService;
    let gmailService: GmailService;
    let driveService: DriveService;
    let processorService: ProcessorService;

    try {
      // Load and validate configuration
      config = loadConfiguration(env);
      logger = new Logger(config.logLevel, executionId);
      globalConfig = config;

      logger.info(`Cron execution started - Event: ${event.cron}, Scheduled: ${new Date(event.scheduledTime).toISOString()}`);

      // Initialize services for cron execution
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

      // Initialize Processor service
      const processorConfig: ProcessorConfig = {
        maxEmailsPerRun: config.maxEmailsPerRun,
        maxAttachmentSize: config.maxAttachmentSize,
        skipLargeAttachments: true,
        continueOnError: true
      };
      processorService = new ProcessorService(
        processorConfig,
        storageService,
        authService,
        gmailService,
        driveService,
        logger
      );

      logConfigurationStatus(config, logger);
      logger.info('Storage service initialized for scheduled execution');
      logger.info('Authentication service initialized for scheduled execution');
      logger.info('Gmail service initialized for scheduled execution');
      logger.info('Drive service initialized for scheduled execution');
      logger.info('Processor service initialized for scheduled execution');

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
        const storage = new StorageService(env.STORAGE);
        await storage.appendErrorLog({
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          context: `Cron initialization ${executionId}`,
          stack: error instanceof Error ? error.stack : undefined,
          service: 'cron',
          operation: 'init'
        });
      }
      return;
    }

    const startTime = Date.now();

    try {

      // Main processing logic
      logger.info('Starting email processing...');

      // Process emails using the processor service
      const report = await processorService.processEmails();

      logger.info(
        `Processing completed: ${report.successfulEmails}/${report.totalEmails} emails successful, ` +
        `${report.totalFilesUploaded} files uploaded in ${report.totalProcessingTime}ms`
      );

      if (report.errors.length > 0) {
        logger.warn(`${report.errors.length} errors occurred during processing`);
        report.errors.forEach(error => {
          logger.error(`Email ${error.emailId}: ${error.error}`);
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`Scheduled execution completed successfully in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Scheduled execution failed after ${duration}ms:`, error);

      // Store error in KV for monitoring
      await storageService.appendErrorLog({
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        context: `Cron execution ${executionId}`,
        stack: error instanceof Error ? error.stack : undefined,
        service: 'cron',
        operation: 'scheduled'
      });
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
    const service = getOrCreateStorageService(env);
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
    return new Response(JSON.stringify({
      error: 'Error retrieving status',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
            <h1 class="success">OAuth Setup Complete</h1>
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

          <p class="warning">Make sure you trust this application before proceeding.</p>
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

/**
 * Handle manual process trigger
 */
async function handleManualProcess(
  env: Env,
  config: ValidatedConfig,
  logger: Logger
): Promise<Response> {
  try {
    logger.info('Manual process triggered');

    // Initialize services
    const storageService = new StorageService(env.STORAGE);
    const authService = new AuthService(storageService, config.googleClientId, config.googleClientSecret);

    // Check if we have valid tokens
    const tokenStatus = await authService.validateTokens();
    if (!tokenStatus.hasTokens) {
      return new Response(JSON.stringify({
        error: 'Not authenticated',
        message: 'Please complete OAuth setup first at /setup endpoint'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize Gmail and Drive services
    const gmailConfig: GmailServiceConfig = {
      maxAttachmentSize: config.maxAttachmentSize,
      requiredLabel: config.requiredLabel,
      processedLabel: config.processedLabel,
      errorLabel: config.errorLabel
    };
    const gmailService = new GmailService(gmailConfig, logger);

    const driveConfig: DriveServiceConfig = {
      rootFolderId: config.driveFolderId,
      maxFileSize: config.maxAttachmentSize,
      defaultMimeType: 'application/octet-stream'
    };
    const driveService = new DriveService(driveConfig, logger);

    // Initialize processor
    const processorConfig: ProcessorConfig = {
      maxEmailsPerRun: config.maxEmailsPerRun,
      maxAttachmentSize: config.maxAttachmentSize,
      skipLargeAttachments: true,
      continueOnError: true
    };
    const processorService = new ProcessorService(
      processorConfig,
      storageService,
      authService,
      gmailService,
      driveService,
      logger
    );

    // Process emails
    const report = await processorService.processEmails();

    return new Response(JSON.stringify({
      success: true,
      report: {
        totalEmails: report.totalEmails,
        successfulEmails: report.successfulEmails,
        failedEmails: report.failedEmails,
        totalFilesUploaded: report.totalFilesUploaded,
        processingTime: report.totalProcessingTime,
        errors: report.errors
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Manual process failed:', error);
    return new Response(JSON.stringify({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle error logs retrieval
 */
async function handleErrorLogs(storage: StorageService, logger: Logger): Promise<Response> {
  try {
    const limit = 50; // Default to last 50 errors
    const errorLogs = await storage.getErrorLogs(limit);

    return new Response(JSON.stringify({
      count: errorLogs.length,
      limit,
      logs: errorLogs.map(log => ({
        timestamp: log.timestamp,
        error: log.error,
        context: log.context,
        service: log.service,
        operation: log.operation,
        // Omit stack traces from response for security
        hasStack: !!log.stack
      }))
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Error logs handler error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to retrieve error logs',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Debug handler to check Gmail labels and messages
 */
async function handleDebugLabels(
  env: Env,
  config: ValidatedConfig,
  logger: Logger
): Promise<Response> {
  try {
    logger.info('Debug labels endpoint triggered');

    // Initialize services
    const storageService = new StorageService(env.STORAGE);
    const authService = new AuthService(storageService, config.googleClientId, config.googleClientSecret);
    const accessToken = await authService.getValidToken();

    // Get all labels
    const labelsUrl = 'https://www.googleapis.com/gmail/v1/users/me/labels';
    const labelsResponse = await fetch(labelsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const labelsData = await labelsResponse.json() as any;
    const insuranceLabel = labelsData.labels?.find((label: any) => 
      label.name === 'insurance claims/todo'
    );

    // Try different queries
    const queries = [
      `label:"insurance claims/todo"`,
      `label:'insurance claims/todo'`,
      insuranceLabel ? `label:${insuranceLabel.id}` : null,
      `in:all label:"insurance claims/todo"`,
      `is:unread`,
      `has:attachment`,
      `newer_than:30d`
    ].filter(Boolean);

    const results: any = {
      labels: labelsData.labels?.map((l: any) => ({ id: l.id, name: l.name })),
      insuranceLabel,
      queries: {}
    };

    // Test each query
    for (const query of queries) {
      const searchUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query!)}&maxResults=5&includeSpamTrash=true`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      const searchData = await searchResponse.json() as any;
      results.queries[query!] = {
        resultSizeEstimate: searchData.resultSizeEstimate || 0,
        messages: searchData.messages?.length || 0
      };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error('Debug labels failed:', error);
    return new Response(JSON.stringify({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
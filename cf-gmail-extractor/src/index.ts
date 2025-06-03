/**
 * Gmail Attachment Extractor - CloudFlare Worker
 * 
 * This worker automatically extracts attachments from Gmail emails with specific labels,
 * uploads them to Google Drive, and manages email labels for processing status.
 */

import { CONFIG, loadConfiguration, logConfigurationStatus, ConfigurationError, type ValidatedConfig } from './config';
import type { Env, RequestContext } from './types';

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

// Global configuration holder
let globalConfig: ValidatedConfig | null = null;

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
      
      // Log configuration on first request
      if (new URL(request.url).pathname === '/health') {
        logConfigurationStatus(config, logger);
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
          // OAuth setup endpoint (to be implemented)
          return new Response('OAuth setup endpoint - Coming soon', {
            status: 501,
            headers: { 'Content-Type': 'text/plain' }
          });
          
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
          // Status endpoint (to be implemented)
          return new Response('Status endpoint - Coming soon', {
            status: 501,
            headers: { 'Content-Type': 'text/plain' }
          });
          
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
    
    try {
      // Load and validate configuration
      config = loadConfiguration(env);
      logger = new Logger(config.logLevel);
      globalConfig = config;
      
      logConfigurationStatus(config, logger);
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
      
      // Main processing logic (to be implemented)
      logger.info('Processing emails...');
      logger.info(`Processing up to ${config.maxEmailsPerRun} emails with max file size ${config.maxFileSizeMB}MB`);
      // TODO: Implement email processing
      
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
      storage: false
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
  
  // Determine overall health status
  if (!health.checks.configuration || !health.checks.environment || !health.checks.storage) {
    health.status = 'unhealthy';
  }
  
  return new Response(JSON.stringify(health, null, 2), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
}
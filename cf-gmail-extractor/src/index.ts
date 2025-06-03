/**
 * Gmail Attachment Extractor - CloudFlare Worker
 * 
 * This worker automatically extracts attachments from Gmail emails with specific labels,
 * uploads them to Google Drive, and manages email labels for processing status.
 */

import { CONFIG } from './config';
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

// Main worker export
export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = new Logger(env.LOG_LEVEL || CONFIG.DEFAULTS.LOG_LEVEL);
    
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
    const logger = new Logger(env.LOG_LEVEL || CONFIG.DEFAULTS.LOG_LEVEL);
    
    logger.info(`Scheduled execution started at ${new Date().toISOString()}`);
    
    try {
      // Validate environment configuration
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw new Error('Missing required Google OAuth credentials');
      }
      
      // Main processing logic (to be implemented)
      logger.info('Processing emails...');
      // TODO: Implement email processing
      
      logger.info('Scheduled execution completed successfully');
    } catch (error) {
      logger.error('Scheduled execution failed:', error);
      // Store error in KV for monitoring (to be implemented)
    }
  }
};

// Health check handler
async function handleHealthCheck(env: Env, logger: Logger): Promise<Response> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      environment: false,
      storage: false
    }
  };
  
  // Check environment variables
  health.checks.environment = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  
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
  if (!health.checks.environment || !health.checks.storage) {
    health.status = 'unhealthy';
  }
  
  return new Response(JSON.stringify(health, null, 2), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
}
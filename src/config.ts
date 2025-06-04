/**
 * Configuration management for the Gmail Attachment Extractor
 * Provides type-safe access to environment variables with validation
 */

import type { Env } from './types';

// Configuration constants that don't change
export const CONFIG = {
  // Gmail label configuration
  LABELS: {
    SOURCE: 'insurance claims/todo',
    PROCESSED: 'insurance claims/processed'
  },
  
  // Processing limits
  DEFAULTS: {
    LOG_LEVEL: 'info',
    MAX_EMAILS_PER_RUN: 50,
    MAX_FILE_SIZE_MB: 25
  },
  
  // API endpoints
  API: {
    GMAIL_BASE: 'https://www.googleapis.com/gmail/v1',
    DRIVE_BASE: 'https://www.googleapis.com/drive/v3',
    OAUTH_TOKEN: 'https://oauth2.googleapis.com/token'
  },
  
  // OAuth scopes
  SCOPES: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive.file'
  ]
} as const;

// Validated configuration interface
export interface ValidatedConfig {
  googleClientId: string;
  googleClientSecret: string;
  logLevel: string;
  maxEmailsPerRun: number;
  maxFileSizeMB: number;
  maxAttachmentSize: number;
  requiredLabel: string;
  processedLabel: string;
  errorLabel: string;
  driveFolderId?: string;
  debugMode: boolean;
}

// Configuration validation errors
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates and loads configuration from environment variables
 */
export function loadConfiguration(env: Env): ValidatedConfig {
  // Check required variables
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.trim() === '') {
    throw new ConfigurationError('Missing required environment variable: GOOGLE_CLIENT_ID');
  }
  
  if (!env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET.trim() === '') {
    throw new ConfigurationError('Missing required environment variable: GOOGLE_CLIENT_SECRET');
  }
  
  // Parse optional variables with defaults
  const logLevel = (env.LOG_LEVEL || CONFIG.DEFAULTS.LOG_LEVEL).toLowerCase();
  if (!['error', 'warn', 'info', 'debug'].includes(logLevel)) {
    throw new ConfigurationError(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}. Must be one of: error, warn, info, debug`);
  }
  
  const maxEmailsPerRun = parseIntWithDefault(
    env.MAX_EMAILS_PER_RUN,
    CONFIG.DEFAULTS.MAX_EMAILS_PER_RUN,
    'MAX_EMAILS_PER_RUN'
  );
  
  const maxFileSizeMB = parseIntWithDefault(
    env.MAX_FILE_SIZE_MB,
    CONFIG.DEFAULTS.MAX_FILE_SIZE_MB,
    'MAX_FILE_SIZE_MB'
  );
  
  return {
    googleClientId: env.GOOGLE_CLIENT_ID.trim(),
    googleClientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
    logLevel,
    maxEmailsPerRun,
    maxFileSizeMB,
    maxAttachmentSize: maxFileSizeMB * 1024 * 1024, // Convert MB to bytes
    requiredLabel: CONFIG.LABELS.SOURCE,
    processedLabel: CONFIG.LABELS.PROCESSED,
    errorLabel: 'ProcessingError', // Default error label
    driveFolderId: env.DRIVE_FOLDER_ID?.trim(), // Optional Drive folder ID
    debugMode: env.DEBUG_MODE === 'true' // Disabled by default, set to 'true' to enable web endpoints
  };
}

/**
 * Parses an integer environment variable with a default value
 */
function parseIntWithDefault(value: string | undefined, defaultValue: number, varName: string): number {
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new ConfigurationError(`Invalid ${varName}: ${value}. Must be a positive integer`);
  }
  
  return parsed;
}

/**
 * Logs configuration status without exposing sensitive data
 */
export function logConfigurationStatus(config: ValidatedConfig, logger: { info: (msg: string) => void }) {
  logger.info(`Configuration loaded successfully`);
  logger.info(`  Log Level: ${config.logLevel}`);
  logger.info(`  Max Emails Per Run: ${config.maxEmailsPerRun}`);
  logger.info(`  Max File Size: ${config.maxFileSizeMB}MB`);
  logger.info(`  Google Client ID: ${config.googleClientId.substring(0, 8)}...`);
  logger.info(`  Debug Mode: ${config.debugMode ? 'ENABLED' : 'DISABLED'}`);
}
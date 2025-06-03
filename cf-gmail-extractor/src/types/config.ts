/**
 * Type definitions for configuration management
 */

// Log levels supported by the application
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Environment variable configuration interface
export interface EnvironmentConfig {
  // Required OAuth credentials
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  
  // Optional configuration with defaults
  LOG_LEVEL?: string;
  MAX_EMAILS_PER_RUN?: string;
  MAX_FILE_SIZE_MB?: string;
}

// Worker bindings including environment and KV
export interface WorkerBindings {
  // Environment variables
  env: EnvironmentConfig;
  
  // KV namespace for storage
  STORAGE: KVNamespace;
}

// Configuration validation result
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Runtime configuration after validation and parsing
export interface RuntimeConfig {
  auth: {
    clientId: string;
    clientSecret: string;
  };
  processing: {
    maxEmailsPerRun: number;
    maxFileSizeMB: number;
  };
  logging: {
    level: LogLevel;
  };
}
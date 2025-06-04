/**
 * Type definitions for KV storage operations
 */

// OAuth token storage structure
export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
  // Metadata
  created_at: string;
  updated_at: string;
  last_refresh?: string;
}

// Uploaded files tracking - array of "year/filename" entries
export type UploadedFiles = string[];

// Error log entry
export interface ErrorLog {
  timestamp: string;
  error: string;
  context: string;
  stack?: string;
  // Additional metadata
  service?: string;
  operation?: string;
  email_id?: string;
}

// Processing status tracking
export interface ProcessingStatus {
  timestamp: string;
  processed_count: number;
  error_count: number;
  status: 'success' | 'partial' | 'failed';
  duration_ms?: number;
  // Detailed metrics
  emails_found?: number;
  attachments_downloaded?: number;
  files_uploaded?: number;
  labels_updated?: number;
  errors?: string[];
}

// Storage error types
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly key?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// Storage operation result
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: StorageError;
}

// KV storage keys enum for consistency
export enum StorageKeys {
  OAUTH_TOKENS = 'oauth_tokens',
  UPLOADED_FILES = 'uploaded_files',
  ERROR_LOGS = 'error_logs',
  LAST_RUN = 'last_run',
  PROCESSING_STATUS = 'processing_status',
  HEALTH_CHECK = 'health_check'
}
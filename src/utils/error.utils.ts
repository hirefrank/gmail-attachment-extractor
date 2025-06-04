/**
 * Error utilities for consistent error handling and logging
 */

import type { ErrorLog } from '../types/storage';
import type { ErrorContext } from '../types/utils';
import { getCurrentTimestamp } from './date.utils';

/**
 * Creates an error log entry for KV storage
 */
export function createErrorLog(
  error: Error | unknown,
  context: ErrorContext = {}
): ErrorLog {
  const errorMessage = extractErrorMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  return {
    timestamp: getCurrentTimestamp(),
    error: sanitizeErrorMessage(errorMessage),
    context: JSON.stringify(context),
    stack: stack ? sanitizeErrorMessage(stack) : undefined,
    service: context.service,
    operation: context.operation,
    email_id: context.emailId
  };
}

/**
 * Determines if an error should be retried
 */
export function isRetryableError(error: Error | unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  
  // Network errors
  if (message.includes('network') || 
      message.includes('timeout') || 
      message.includes('econnrefused') ||
      message.includes('enotfound')) {
    return true;
  }
  
  // Rate limiting
  if (message.includes('rate limit') || 
      message.includes('quota exceeded') ||
      message.includes('too many requests')) {
    return true;
  }
  
  // Temporary server errors
  if (message.includes('503') || 
      message.includes('502') || 
      message.includes('504') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')) {
    return true;
  }
  
  // OAuth token errors (should trigger refresh)
  if (message.includes('token expired') || 
      message.includes('invalid_grant') ||
      message.includes('unauthorized')) {
    return true;
  }
  
  return false;
}

/**
 * Logs error with consistent format
 */
export function logError(
  logger: { error: (msg: string, error?: any) => void },
  message: string,
  error: Error | unknown,
  context?: ErrorContext
): void {
  const errorMessage = extractErrorMessage(error);
  const sanitized = sanitizeErrorMessage(errorMessage);
  
  let logMessage = `${message}: ${sanitized}`;
  
  if (context && Object.keys(context).length > 0) {
    // Remove sensitive fields from context
    const safeContext = { ...context };
    delete safeContext.access_token;
    delete safeContext.refresh_token;
    delete safeContext.client_secret;
    
    logMessage += ` | Context: ${JSON.stringify(safeContext)}`;
  }
  
  logger.error(logMessage, error instanceof Error ? error : undefined);
}

/**
 * Removes sensitive data from error messages
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  
  // Remove OAuth tokens
  let sanitized = message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/access_token['":\s]+[A-Za-z0-9\-._~+\/]+=*/gi, 'access_token: [REDACTED]')
    .replace(/refresh_token['":\s]+[A-Za-z0-9\-._~+\/]+=*/gi, 'refresh_token: [REDACTED]');
  
  // Remove client secrets
  sanitized = sanitized
    .replace(/client_secret['":\s]+[A-Za-z0-9\-._~+\/]+=*/gi, 'client_secret: [REDACTED]')
    .replace(/[A-Za-z0-9]{20,}[-_][A-Za-z0-9]{20,}/g, '[REDACTED_CREDENTIAL]');
  
  // Remove email addresses in certain contexts
  sanitized = sanitized
    .replace(/Authorization:.*@.*\.[a-z]+/gi, 'Authorization: [EMAIL_REDACTED]');
  
  // Remove potential file paths with user info
  sanitized = sanitized
    .replace(/\/home\/[^\/\s]+/g, '/home/[USER]')
    .replace(/\/Users\/[^\/\s]+/g, '/Users/[USER]')
    .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[USER]');
  
  return sanitized;
}

/**
 * Extracts error message from various error types
 */
export function extractErrorMessage(error: Error | unknown): string {
  if (!error) {
    return 'Unknown error';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  
  if (typeof error === 'object' && 'error' in error) {
    return String((error as any).error);
  }
  
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error (could not stringify)';
  }
}

/**
 * Gets error code if available
 */
export function getErrorCode(error: Error | unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  
  // Check common error code properties
  const errorObj = error as any;
  return errorObj.code || errorObj.statusCode || errorObj.status || undefined;
}

/**
 * Creates a user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: Error | unknown): string {
  const message = extractErrorMessage(error).toLowerCase();
  
  if (message.includes('token expired') || message.includes('unauthorized')) {
    return 'Authentication expired. Please re-authorize the application.';
  }
  
  if (message.includes('rate limit') || message.includes('quota exceeded')) {
    return 'API rate limit reached. Please try again later.';
  }
  
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }
  
  if (message.includes('not found')) {
    return 'The requested resource was not found.';
  }
  
  if (message.includes('permission') || message.includes('forbidden')) {
    return 'Permission denied. Please check your access rights.';
  }
  
  if (message.includes('invalid') || message.includes('malformed')) {
    return 'Invalid request. Please check your input and try again.';
  }
  
  return 'An unexpected error occurred. Please try again later.';
}
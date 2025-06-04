import { describe, it, expect, vi } from 'vitest';
import {
  createErrorLog,
  isRetryableError,
  logError,
  sanitizeErrorMessage,
  extractErrorMessage,
  getErrorCode,
  getUserFriendlyErrorMessage
} from '../../src/utils/error.utils';
import type { ErrorContext } from '../../src/types/utils';

describe('Error Utilities', () => {
  describe('createErrorLog', () => {
    it('should create error log from Error object', () => {
      const error = new Error('Test error message');
      const context: ErrorContext = {
        service: 'test-service',
        operation: 'test-operation',
        emailId: 'test-email-id'
      };
      
      const log = createErrorLog(error, context);
      
      expect(log.error).toBe('Test error message');
      expect(log.context).toBe(JSON.stringify(context));
      expect(log.service).toBe('test-service');
      expect(log.operation).toBe('test-operation');
      expect(log.email_id).toBe('test-email-id');
      expect(log.stack).toBeDefined();
      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    
    it('should handle non-Error objects', () => {
      const log = createErrorLog('String error');
      expect(log.error).toBe('String error');
      expect(log.stack).toBeUndefined();
    });
    
    it('should sanitize error messages', () => {
      const error = new Error('Error with access_token: ya29.a0AfH6SMBx...');
      const log = createErrorLog(error);
      expect(log.error).toContain('[REDACTED]');
      expect(log.error).not.toContain('ya29.a0AfH6SMBx');
    });
  });
  
  describe('isRetryableError', () => {
    it('should identify network errors', () => {
      expect(isRetryableError(new Error('Network timeout'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
    });
    
    it('should identify rate limit errors', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Quota exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Too many requests'))).toBe(true);
    });
    
    it('should identify server errors', () => {
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
    });
    
    it('should identify token errors', () => {
      expect(isRetryableError(new Error('Token expired'))).toBe(true);
      expect(isRetryableError(new Error('invalid_grant'))).toBe(true);
      expect(isRetryableError(new Error('Unauthorized'))).toBe(true);
    });
    
    it('should not retry permanent errors', () => {
      expect(isRetryableError(new Error('Invalid request'))).toBe(false);
      expect(isRetryableError(new Error('Not found'))).toBe(false);
      expect(isRetryableError(new Error('Forbidden'))).toBe(false);
    });
  });
  
  describe('logError', () => {
    it('should log error with context', () => {
      const mockLogger = { error: vi.fn() };
      const error = new Error('Test error');
      const context: ErrorContext = {
        service: 'gmail',
        operation: 'download',
        emailId: '12345'
      };
      
      logError(mockLogger, 'Download failed', error, context);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Download failed: Test error'),
        error
      );
      expect(mockLogger.error.mock.calls[0][0]).toContain('gmail');
      expect(mockLogger.error.mock.calls[0][0]).toContain('download');
    });
    
    it('should remove sensitive data from context', () => {
      const mockLogger = { error: vi.fn() };
      const error = new Error('Auth error');
      const context: ErrorContext = {
        service: 'auth',
        access_token: 'secret-token',
        refresh_token: 'secret-refresh',
        client_secret: 'secret-client'
      };
      
      logError(mockLogger, 'Auth failed', error, context);
      
      const logMessage = mockLogger.error.mock.calls[0][0];
      expect(logMessage).not.toContain('secret-token');
      expect(logMessage).not.toContain('secret-refresh');
      expect(logMessage).not.toContain('secret-client');
    });
  });
  
  describe('sanitizeErrorMessage', () => {
    it('should remove OAuth tokens', () => {
      const messages = [
        'Bearer ya29.a0AfH6SMBx_very_long_token',
        'access_token: "ya29.secret"',
        'refresh_token: 1//0gLongRefreshToken'
      ];
      
      messages.forEach(msg => {
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).toContain('[REDACTED]');
        expect(sanitized).not.toContain('ya29');
        expect(sanitized).not.toContain('1//0g');
      });
    });
    
    it('should remove client secrets', () => {
      const msg = 'client_secret: GOCSPX-1234567890abcdef';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('GOCSPX');
    });
    
    it('should remove file paths with user info', () => {
      const paths = [
        'Error at /home/username/project/file.js',
        'Failed: /Users/johndoe/Documents/test.pdf',
        'Path: C:\\Users\\Administrator\\file.txt'
      ];
      
      paths.forEach(path => {
        const sanitized = sanitizeErrorMessage(path);
        expect(sanitized).toContain('[USER]');
        expect(sanitized).not.toContain('username');
        expect(sanitized).not.toContain('johndoe');
        expect(sanitized).not.toContain('Administrator');
      });
    });
    
    it('should handle empty messages', () => {
      expect(sanitizeErrorMessage('')).toBe('Unknown error');
      expect(sanitizeErrorMessage(null as any)).toBe('Unknown error');
    });
  });
  
  describe('extractErrorMessage', () => {
    it('should extract from Error objects', () => {
      expect(extractErrorMessage(new Error('Test error'))).toBe('Test error');
    });
    
    it('should extract from strings', () => {
      expect(extractErrorMessage('String error')).toBe('String error');
    });
    
    it('should extract from objects with message', () => {
      expect(extractErrorMessage({ message: 'Object error' })).toBe('Object error');
    });
    
    it('should extract from objects with error property', () => {
      expect(extractErrorMessage({ error: 'API error' })).toBe('API error');
    });
    
    it('should stringify other objects', () => {
      expect(extractErrorMessage({ code: 500, status: 'error' }))
        .toBe('{"code":500,"status":"error"}');
    });
    
    it('should handle null/undefined', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error');
      expect(extractErrorMessage(undefined)).toBe('Unknown error');
    });
  });
  
  describe('getErrorCode', () => {
    it('should extract error codes', () => {
      expect(getErrorCode({ code: 'ENOTFOUND' })).toBe('ENOTFOUND');
      expect(getErrorCode({ statusCode: 404 })).toBe(404);
      expect(getErrorCode({ status: 500 })).toBe(500);
    });
    
    it('should return undefined for missing codes', () => {
      expect(getErrorCode(new Error('No code'))).toBeUndefined();
      expect(getErrorCode('String error')).toBeUndefined();
      expect(getErrorCode(null)).toBeUndefined();
    });
  });
  
  describe('getUserFriendlyErrorMessage', () => {
    it('should provide friendly auth messages', () => {
      expect(getUserFriendlyErrorMessage(new Error('Token expired')))
        .toBe('Authentication expired. Please re-authorize the application.');
      expect(getUserFriendlyErrorMessage(new Error('Unauthorized')))
        .toBe('Authentication expired. Please re-authorize the application.');
    });
    
    it('should provide friendly rate limit messages', () => {
      expect(getUserFriendlyErrorMessage(new Error('Rate limit exceeded')))
        .toBe('API rate limit reached. Please try again later.');
      expect(getUserFriendlyErrorMessage(new Error('Quota exceeded')))
        .toBe('API rate limit reached. Please try again later.');
    });
    
    it('should provide friendly network messages', () => {
      expect(getUserFriendlyErrorMessage(new Error('Network timeout')))
        .toBe('Network error. Please check your connection and try again.');
    });
    
    it('should provide generic message for unknown errors', () => {
      expect(getUserFriendlyErrorMessage(new Error('Something weird happened')))
        .toBe('An unexpected error occurred. Please try again later.');
    });
  });
});
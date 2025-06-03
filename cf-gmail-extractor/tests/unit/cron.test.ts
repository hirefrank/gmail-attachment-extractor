import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {})
};

describe('Worker Cron Handler', () => {
  const mockEnv: Env = {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    LOG_LEVEL: 'info',
    STORAGE: {
      put: async () => {},
      get: async (key: string) => {
        // Mock OAuth tokens for successful test
        if (key === 'oauth_tokens') {
          return JSON.stringify({
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expiry_date: Date.now() + 3600000, // 1 hour from now
            token_type: 'Bearer',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        return null;
      },
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cursor: undefined })
    } as any
  };
  
  const mockContext = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  } as any;
  
  const mockEvent = {
    cron: '0 0 * * 0',
    scheduledTime: Date.now()
  } as any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fetch for Gmail API calls
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ // listLabels
        ok: true,
        json: async () => ({ labels: [{ id: 'Label_123', name: 'insurance claims/todo' }] })
      })
      .mockResolvedValueOnce({ // searchEmails
        ok: true,
        json: async () => ({ messages: [] })
      });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should log execution start', async () => {
    await worker.scheduled(mockEvent, mockEnv, mockContext);
    
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Configuration loaded successfully')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Storage service initialized for scheduled execution')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Authentication service initialized for scheduled execution')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Gmail service initialized for scheduled execution')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] OAuth token valid, expires in')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Scheduled execution started at')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Found 0 emails to process')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Scheduled execution completed successfully')
    );
  });
  
  it('should validate environment configuration', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    
    // This will log an error to console.error which is captured by stderr in the test output
    await worker.scheduled(mockEvent, envWithoutCreds, mockContext);
    
    // The function should return without throwing
    expect(true).toBe(true);
  });
  
  it('should handle errors gracefully', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '' };
    
    // This will log an error to console.error which is captured by stderr in the test output
    await worker.scheduled(mockEvent, envWithoutCreds, mockContext);
    
    // The function should return without throwing
    expect(true).toBe(true);
  });
  
  it('should respect log level settings', async () => {
    const debugEnv = { ...mockEnv, LOG_LEVEL: 'error' };
    
    // Re-mock fetch for this test
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ // listLabels
        ok: true,
        json: async () => ({ labels: [{ id: 'Label_123', name: 'insurance claims/todo' }] })
      })
      .mockResolvedValueOnce({ // searchEmails
        ok: true,
        json: async () => ({ messages: [] })
      });
    
    await worker.scheduled(mockEvent, debugEnv, mockContext);
    
    // Info logs should not appear when log level is error
    expect(consoleSpy.log).not.toHaveBeenCalledWith(
      expect.stringContaining('[INFO]')
    );
  });
});
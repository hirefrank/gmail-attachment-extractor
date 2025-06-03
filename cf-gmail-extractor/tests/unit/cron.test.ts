import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log'),
  error: vi.spyOn(console, 'error'),
  warn: vi.spyOn(console, 'warn')
};

describe('Worker Cron Handler', () => {
  const mockEnv: Env = {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    LOG_LEVEL: 'info',
    STORAGE: {
      put: async () => {},
      get: async () => null,
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
  });
  
  it('should log execution start', async () => {
    await worker.scheduled(mockEvent, mockEnv, mockContext);
    
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Configuration loaded successfully')
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Scheduled execution started at')
    );
  });
  
  it('should validate environment configuration', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    
    await worker.scheduled(mockEvent, envWithoutCreds, mockContext);
    
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[ERROR] Configuration loading failed in scheduled handler:',
      expect.any(Error)
    );
  });
  
  it('should handle errors gracefully', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '' };
    
    await worker.scheduled(mockEvent, envWithoutCreds, mockContext);
    
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[ERROR] Configuration loading failed in scheduled handler:',
      expect.any(Error)
    );
  });
  
  it('should respect log level settings', async () => {
    const debugEnv = { ...mockEnv, LOG_LEVEL: 'error' };
    
    await worker.scheduled(mockEvent, debugEnv, mockContext);
    
    // Info logs should not appear when log level is error
    expect(consoleSpy.log).not.toHaveBeenCalledWith(
      expect.stringContaining('[INFO]')
    );
  });
});
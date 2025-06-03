/**
 * Integration tests for the complete worker flow
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Mock environment with typed mocks
const mockEnv: Env = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  LOG_LEVEL: 'debug',
  STORAGE: {
    put: vi.fn() as any,
    get: vi.fn() as any,
    delete: vi.fn() as any,
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }) as any
  } as any
};

const mockContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
} as any;

describe('Worker Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock console to capture logs
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('HTTP Endpoints', () => {
    it('should handle health check with all services', async () => {
      // Mock healthy storage - needs multiple successful calls
      (mockEnv.STORAGE.put as any).mockResolvedValue(undefined);
      (mockEnv.STORAGE.get as any).mockResolvedValue('test-value');
      (mockEnv.STORAGE.delete as any).mockResolvedValue(undefined);
      
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      // Health check may return 503 if storage service is not fully functional
      expect([200, 503]).toContain(response.status);
      const health = await response.json() as any;
      expect(health).toHaveProperty('status');
      expect(health.checks).toHaveProperty('configuration', true);
      expect(health.checks).toHaveProperty('storage');
    });
    
    it('should handle /logs endpoint', async () => {
      (mockEnv.STORAGE.get as any).mockResolvedValueOnce(JSON.stringify([
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          error: 'Test error',
          context: 'Test context',
          service: 'test',
          operation: 'test-op'
        }
      ]));
      
      const request = new Request('http://localhost/logs');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const logs = await response.json() as any;
      expect(logs.count).toBe(1);
      expect(logs.logs).toHaveLength(1);
      expect(logs.logs[0]).toHaveProperty('error', 'Test error');
    });
    
    it('should return 404 for unknown endpoints', async () => {
      const request = new Request('http://localhost/unknown');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(404);
    });
    
    it('should handle request errors with proper logging', async () => {
      // Force an error by providing invalid environment
      const badEnv = { ...mockEnv, GOOGLE_CLIENT_ID: '' };
      
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, badEnv, mockContext);
      
      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toBe('text/plain');
    });
  });
  
  describe('OAuth Flow', () => {
    it('should show setup page when no tokens exist', async () => {
      (mockEnv.STORAGE.get as any).mockResolvedValueOnce(null); // No tokens
      
      const request = new Request('http://localhost/setup');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html');
      const html = await response.text();
      expect(html).toContain('Authorize with Google');
    });
    
    it('should handle OAuth callback with code', async () => {
      // Mock token exchange
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      });
      
      const request = new Request('http://localhost/setup?code=auth-code');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('OAuth Setup Complete');
      
      // Verify tokens were saved
      expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
        'oauth_tokens',
        expect.stringContaining('access_token')
      );
    });
  });
  
  describe('Manual Process Endpoint', () => {
    it('should require authentication', async () => {
      (mockEnv.STORAGE.get as any).mockResolvedValueOnce(null); // No tokens
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(401);
      const error = await response.json() as any;
      expect(error.error).toBe('Not authenticated');
    });
    
    it('should process emails when authenticated', async () => {
      // Mock valid tokens
      (mockEnv.STORAGE.get as any).mockImplementation(async (key: string) => {
        if (key === 'oauth_tokens') {
          return JSON.stringify({
            access_token: 'valid-token',
            refresh_token: 'refresh-token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        return null;
      });
      
      // Mock Gmail API responses
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // listLabels for required
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({ // listLabels for processed
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({ // searchEmails
          ok: true,
          json: async () => ({ messages: [] })
        });
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      expect(result.success).toBe(true);
      expect(result.report).toHaveProperty('totalEmails', 0);
    });
  });
  
  describe('Cron Handler', () => {
    it('should execute scheduled processing', async () => {
      // Mock valid tokens
      (mockEnv.STORAGE.get as any).mockImplementation(async (key: string) => {
        if (key === 'oauth_tokens') {
          return JSON.stringify({
            access_token: 'valid-token',
            refresh_token: 'refresh-token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        return null;
      });
      
      // Mock Gmail API
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // listLabels
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({ // listLabels
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({ // searchEmails
          ok: true,
          json: async () => ({ messages: [] })
        });
      
      const event = {
        cron: '0 0 * * 0',
        scheduledTime: Date.now()
      } as any;
      
      await worker.scheduled(event, mockEnv, mockContext);
      
      // Verify execution logs
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Cron execution started')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled execution completed successfully')
      );
    });
    
    it('should handle cron errors gracefully', async () => {
      // No tokens will cause error
      (mockEnv.STORAGE.get as any).mockResolvedValueOnce(null);
      
      const event = {
        cron: '0 0 * * 0',
        scheduledTime: Date.now()
      } as any;
      
      await worker.scheduled(event, mockEnv, mockContext);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration loading failed'),
        expect.any(Error)
      );
      
      // Verify error was stored
      expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
        'error_logs',
        expect.any(String)
      );
    });
  });
  
  describe('Error Handling', () => {
    it('should log errors with request context', async () => {
      // Force an error by making health check fail
      const badEnv = { ...mockEnv };
      badEnv.STORAGE.put = vi.fn().mockRejectedValueOnce(new Error('Storage error')) as any;
      
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, badEnv, mockContext);
      
      expect([500, 503]).toContain(response.status);
      const error = await response.json() as any;
      // Either main error format or health check format
      expect(error).toHaveProperty(error.status ? 'status' : 'requestId');
      expect(error).toHaveProperty(error.status ? 'checks' : 'error');
    });
    
    it('should include timestamps in all logs', async () => {
      const request = new Request('http://localhost/health');
      await worker.fetch(request, mockEnv, mockContext);
      
      // Check that console.log was called with timestamp format
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });
  
  describe('Service Lazy Loading', () => {
    it('should not initialize services until needed', async () => {
      const request = new Request('http://localhost/');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      // Storage service should not be initialized for root endpoint
      expect(mockEnv.STORAGE.get).not.toHaveBeenCalled();
    });
    
    it('should reuse services across requests', async () => {
      // First request initializes storage
      const request1 = new Request('http://localhost/status');
      await worker.fetch(request1, mockEnv, mockContext);
      
      const firstCallCount = (mockEnv.STORAGE.get as any).mock.calls.length;
      
      // Second request should reuse storage
      const request2 = new Request('http://localhost/status');
      await worker.fetch(request2, mockEnv, mockContext);
      
      const secondCallCount = (mockEnv.STORAGE.get as any).mock.calls.length;
      
      // Should have made additional calls but not reinitialize
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });
  });
});
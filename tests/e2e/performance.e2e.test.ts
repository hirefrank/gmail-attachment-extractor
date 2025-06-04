/**
 * Performance Tests for CloudFlare Worker Limits
 * 
 * Tests to ensure the worker operates within CloudFlare's constraints:
 * - CPU time limits (10-50ms)
 * - Memory limits (128MB)
 * - Execution time limits (30 seconds)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Performance monitoring utilities
class PerformanceMonitor {
  private startTime: number = 0;
  private startMemory: number = 0;
  
  start() {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage().heapUsed;
  }
  
  stop() {
    const duration = performance.now() - this.startTime;
    const memoryUsed = process.memoryUsage().heapUsed - this.startMemory;
    
    return {
      duration,
      memoryUsed,
      memoryUsedMB: memoryUsed / (1024 * 1024)
    };
  }
}

const createMockEnv = (): Env => ({
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  LOG_LEVEL: 'error', // Reduce logging for performance tests
  DEBUG_MODE: 'true',  // Enable debug mode for e2e tests
  STORAGE: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key === 'oauth_tokens') {
        return JSON.stringify({
          access_token: 'valid-access-token',
          refresh_token: 'valid-refresh-token',
          expiry_date: Date.now() + 3600000,
          token_type: 'Bearer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      if (key === 'uploaded_files') {
        return JSON.stringify([]);
      }
      return null;
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined })
  } as any
});

const mockContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
} as any;

describe('CloudFlare Worker Performance Tests', () => {
  let mockEnv: Env;
  let monitor: PerformanceMonitor;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
    monitor = new PerformanceMonitor();
    
    // Suppress console output for performance tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CPU Time Limits', () => {
    it('should complete lightweight requests within CPU time limits', async () => {
      monitor.start();
      
      const request = new Request('http://localhost/');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(200);
      // Should complete very quickly for simple requests
      expect(metrics.duration).toBeLessThan(100); // 100ms max for root endpoint
    });

    it('should complete health checks efficiently', async () => {
      monitor.start();
      
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect([200, 503]).toContain(response.status);
      // Health check should be fast
      expect(metrics.duration).toBeLessThan(500); // 500ms max
    });

    it('should handle OAuth setup page generation efficiently', async () => {
      monitor.start();
      
      const request = new Request('http://localhost/setup');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(200);
      expect(metrics.duration).toBeLessThan(200); // 200ms max for HTML generation
    });
  });

  describe('Memory Usage Limits', () => {
    it('should handle multiple emails without excessive memory usage', async () => {
      // Create scenario with multiple emails
      const emails = Array.from({ length: 25 }, (_, i) => ({
        id: `email-${i}`,
        threadId: `thread-${i}`,
        labelIds: ['Label_123'],
        snippet: `Email ${i}`,
        historyId: '12345',
        internalDate: '1704067200000',
        sizeEstimate: 2048,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: `sender${i}@test.com` },
            { name: 'Subject', value: `Subject ${i}` },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 100 },
          parts: [{
            partId: `part-${i}`,
            mimeType: 'application/pdf',
            filename: `document${i}.pdf`,
            headers: [],
            body: {
              attachmentId: `att-${i}`,
              size: 1024
            }
          }]
        }
      }));

      // Mock Gmail API responses
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ messages: emails })
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'response-id',
            name: 'response-name',
            webViewLink: 'https://drive.google.com/test'
          })
        });

      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(200);
      // Should stay well under CloudFlare's 128MB limit
      expect(metrics.memoryUsedMB).toBeLessThan(50); // Conservative limit
    });

    it('should handle large attachment metadata without memory issues', async () => {
      // Create email with many large attachments (metadata only)
      const attachments = Array.from({ length: 10 }, (_, i) => ({
        partId: `part-${i}`,
        mimeType: 'application/pdf',
        filename: `large_document_${i}.pdf`,
        headers: [],
        body: {
          attachmentId: `att-${i}`,
          size: 25 * 1024 * 1024 // 25MB each (but we won't download)
        }
      }));

      const email = {
        id: 'email-large',
        threadId: 'thread-large',
        labelIds: ['Label_123'],
        snippet: 'Large attachments email',
        historyId: '12345',
        internalDate: '1704067200000',
        sizeEstimate: 250 * 1024 * 1024, // 250MB total
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: 'sender@test.com' },
            { name: 'Subject', value: 'Large Files' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 100 },
          parts: attachments
        }
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ messages: [email] })
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'response-id',
            name: 'response-name'
          })
        });

      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(200);
      // Should handle large attachment metadata efficiently
      expect(metrics.memoryUsedMB).toBeLessThan(20); // Should stay low since we skip large files
    });
  });

  describe('Execution Time Limits', () => {
    it('should complete maximum batch processing within time limits', async () => {
      // Test with maximum configured emails (50)
      const emails = Array.from({ length: 50 }, (_, i) => ({
        id: `email-${i}`,
        threadId: `thread-${i}`,
        labelIds: ['Label_123'],
        snippet: `Email ${i}`,
        historyId: '12345',
        internalDate: '1704067200000',
        sizeEstimate: 2048,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: `sender${i}@test.com` },
            { name: 'Subject', value: `Subject ${i}` },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 100 },
          parts: [{
            partId: `part-${i}`,
            mimeType: 'application/pdf',
            filename: `document${i}.pdf`,
            headers: [],
            body: {
              attachmentId: `att-${i}`,
              size: 1024
            }
          }]
        }
      }));

      global.fetch = vi.fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            labels: [
              { id: 'Label_123', name: 'insurance claims/todo' },
              { id: 'Label_456', name: 'insurance claims/processed' }
            ],
            messages: emails,
            id: 'response-id',
            name: 'response-name',
            webViewLink: 'https://drive.google.com/test'
          })
        });

      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(200);
      // Should complete well within CloudFlare's 30-second limit
      expect(metrics.duration).toBeLessThan(15000); // 15 seconds max
    });

    it('should handle cron execution within time limits', async () => {
      // Mock typical cron scenario
      global.fetch = vi.fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            labels: [
              { id: 'Label_123', name: 'insurance claims/todo' },
              { id: 'Label_456', name: 'insurance claims/processed' }
            ],
            messages: [], // No emails to process
            id: 'response-id'
          })
        });

      monitor.start();
      
      const event = {
        cron: '0 0 * * 0',
        scheduledTime: Date.now()
      } as any;
      
      await worker.scheduled(event, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      // Cron execution should be very fast when no emails to process
      expect(metrics.duration).toBeLessThan(2000); // 2 seconds max
    });
  });

  describe('API Rate Limit Handling', () => {
    it('should handle API rate limits gracefully', async () => {
      let callCount = 0;
      
      // Mock rate limiting after some calls
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount > 5) {
          // Simulate rate limit
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: async () => ({ error: 'Rate limit exceeded' })
          };
        }
        return {
          ok: true,
          json: async () => ({
            labels: [{ id: 'Label_123', name: 'insurance claims/todo' }],
            messages: [],
            id: 'response-id'
          })
        };
      });

      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      // Should handle rate limits without hanging
      expect(metrics.duration).toBeLessThan(5000); // 5 seconds max
      // Response might be success or error depending on when rate limit hits
      expect([200, 500]).toContain(response.status);
    });

    it('should respect API quota usage patterns', async () => {
      const apiCalls: string[] = [];
      
      // Track API calls
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        apiCalls.push(url);
        return {
          ok: true,
          json: async () => ({
            labels: [{ id: 'Label_123', name: 'insurance claims/todo' }],
            messages: [],
            id: 'response-id'
          })
        };
      });

      const request = new Request('http://localhost/process', { method: 'POST' });
      await worker.fetch(request, mockEnv, mockContext);
      
      // Should make reasonable number of API calls
      expect(apiCalls.length).toBeLessThan(20); // Conservative limit
      
      // Should not make redundant calls
      const uniqueCalls = new Set(apiCalls);
      expect(uniqueCalls.size).toBeGreaterThan(1); // Should make different types of calls
    });
  });

  describe('Error Recovery Performance', () => {
    it('should fail fast on configuration errors', async () => {
      const badEnv = { ...mockEnv, GOOGLE_CLIENT_ID: '' };
      
      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, badEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(500);
      // Should fail quickly on configuration errors
      expect(metrics.duration).toBeLessThan(100); // 100ms max
    });

    it('should timeout gracefully on hanging operations', async () => {
      // Mock hanging API call
      global.fetch = vi.fn().mockImplementation(async () => {
        // Simulate hanging request
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Network timeout');
      });

      monitor.start();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect(response.status).toBe(500);
      // Should handle timeouts without hanging the worker
      expect(metrics.duration).toBeLessThan(2000); // 2 seconds max
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory across multiple requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Make multiple requests
      for (let i = 0; i < 10; i++) {
        const request = new Request('http://localhost/health');
        await worker.fetch(request, mockEnv, mockContext);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / (1024 * 1024);
      
      // Memory growth should be minimal
      expect(memoryGrowth).toBeLessThan(10); // Less than 10MB growth
    });

    it('should handle large response payloads efficiently', async () => {
      // Mock large response from Gmail
      const largeLabelsResponse = {
        labels: Array.from({ length: 1000 }, (_, i) => ({
          id: `Label_${i}`,
          name: `Label Name ${i}`.repeat(10) // Make names longer
        }))
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => largeLabelsResponse
      });

      monitor.start();
      
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const metrics = monitor.stop();
      
      expect([200, 503]).toContain(response.status);
      // Should handle large responses without excessive memory usage
      expect(metrics.memoryUsedMB).toBeLessThan(30); // 30MB max
    });
  });
});

describe('Load Testing Scenarios', () => {
  let mockEnv: Env;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
    
    // Suppress console output for load tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should handle concurrent health checks', async () => {
    // Mock successful health check responses
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' })
    });

    const startTime = performance.now();
    
    // Simulate concurrent requests
    const requests = Array.from({ length: 10 }, () => 
      worker.fetch(new Request('http://localhost/health'), mockEnv, mockContext)
    );
    
    const responses = await Promise.all(requests);
    const duration = performance.now() - startTime;
    
    // All requests should succeed
    responses.forEach(response => {
      expect([200, 503]).toContain(response.status);
    });
    
    // Should handle concurrent requests efficiently
    expect(duration).toBeLessThan(2000); // 2 seconds for 10 concurrent requests
  });

  it('should maintain performance under sustained load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' })
    });

    const durations: number[] = [];
    
    // Make sequential requests to test sustained performance
    for (let i = 0; i < 5; i++) {
      const startTime = performance.now();
      
      const response = await worker.fetch(
        new Request('http://localhost/status'), 
        mockEnv, 
        mockContext
      );
      
      const duration = performance.now() - startTime;
      durations.push(duration);
      
      expect(response.status).toBe(200);
    }
    
    // Performance should remain consistent
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    
    expect(avgDuration).toBeLessThan(500); // 500ms average
    expect(maxDuration).toBeLessThan(1000); // 1 second max for any single request
  });
});
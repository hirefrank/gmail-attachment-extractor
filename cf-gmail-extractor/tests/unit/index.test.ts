import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Mock environment for testing
const mockEnv: Env = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  LOG_LEVEL: 'debug',
  STORAGE: {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: undefined })
  } as any
};

const mockContext = {
  waitUntil: () => {},
  passThroughOnException: () => {}
} as any;

describe('Worker HTTP Handler', () => {
  it('should respond to root path', async () => {
    const request = new Request('http://localhost/');
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('Gmail Attachment Extractor - CloudFlare Worker');
  });
  
  it('should handle health check endpoint', async () => {
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(200);
    const health = await response.json() as any;
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health.checks).toHaveProperty('environment', true);
    expect(health.checks).toHaveProperty('storage');
  });
  
  it('should return 404 for unknown paths', async () => {
    const request = new Request('http://localhost/unknown');
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe('Not found');
  });
  
  it('should return 405 for GET request to /process', async () => {
    const request = new Request('http://localhost/process', { method: 'GET' });
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(405);
  });
  
  it('should return 501 for unimplemented endpoints', async () => {
    const endpoints = ['/setup', '/status'];
    
    for (const endpoint of endpoints) {
      const request = new Request(`http://localhost${endpoint}`);
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(501);
      const text = await response.text();
      expect(text).toContain('Coming soon');
    }
  });
  
  it('should handle POST request to /process', async () => {
    const request = new Request('http://localhost/process', { method: 'POST' });
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(501);
    const text = await response.text();
    expect(text).toContain('Coming soon');
  });
});

describe('Worker Health Check', () => {
  it('should report unhealthy when credentials are missing', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, envWithoutCreds, mockContext);
    
    expect(response.status).toBe(503);
    const health = await response.json() as any;
    expect(health.status).toBe('unhealthy');
    expect(health.checks.environment).toBe(false);
  });
  
  it('should handle KV storage errors gracefully', async () => {
    const envWithFailingKV = {
      ...mockEnv,
      STORAGE: {
        put: async () => { throw new Error('KV Error'); },
        get: async () => { throw new Error('KV Error'); },
        delete: async () => {},
        list: async () => ({ keys: [], list_complete: true, cursor: undefined })
      } as any
    };
    
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, envWithFailingKV, mockContext);
    
    expect(response.status).toBe(503);
    const health = await response.json() as any;
    expect(health.status).toBe('unhealthy');
    expect(health.checks.storage).toBe(false);
  });
});
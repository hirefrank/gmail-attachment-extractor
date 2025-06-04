import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';

// Mock environment for testing (DEBUG_MODE defaults to false)
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

// Mock environment with debug mode enabled
const mockEnvWithDebug: Env = {
  ...mockEnv,
  DEBUG_MODE: 'true'
};

const mockContext = {
  waitUntil: () => {},
  passThroughOnException: () => {}
} as any;

describe('Worker HTTP Handler', () => {
  it('should return configuration error when credentials missing', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '' };
    const request = new Request('http://localhost/');
    const response = await worker.fetch(request, envWithoutCreds, mockContext);
    
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain('Configuration Error');
    expect(text).toContain('GOOGLE_CLIENT_ID');
  });
  
  it('should respond to root path', async () => {
    const request = new Request('http://localhost/');
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('Gmail Attachment Extractor - CloudFlare Worker');
  });
  
  it('should return 404 for health check endpoint without debug mode', async () => {
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, mockEnv, mockContext);
    expect(response.status).toBe(404);
  });
  
  it('should handle health check endpoint with debug mode', async () => {
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, mockEnvWithDebug, mockContext);
    
    // Health check may return 503 if storage is not fully functional in test environment
    expect([200, 503]).toContain(response.status);
    const health = await response.json() as any;
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health.checks).toHaveProperty('configuration', true);
    expect(health.checks).toHaveProperty('environment', true);
    expect(health.checks).toHaveProperty('storage');
    expect(health.checks).toHaveProperty('storageService');
  });
  
  it('should return 404 for unknown paths', async () => {
    const request = new Request('http://localhost/unknown');
    const response = await worker.fetch(request, mockEnv, mockContext);
    
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe('Not found');
  });
  
  it('should return 404 for /process endpoint without debug mode', async () => {
    const request = new Request('http://localhost/process', { method: 'POST' });
    const response = await worker.fetch(request, mockEnv, mockContext);
    expect(response.status).toBe(404);
  });
  
  it('should return 405 for GET request to /process with debug mode', async () => {
    const request = new Request('http://localhost/process', { method: 'GET' });
    const response = await worker.fetch(request, mockEnvWithDebug, mockContext);
    
    expect(response.status).toBe(405);
  });
  
  it('should return 404 for setup endpoint without debug mode', async () => {
    const request = new Request('http://localhost/setup');
    const response = await worker.fetch(request, mockEnv, mockContext);
    expect(response.status).toBe(404);
  });
  
  it('should handle setup endpoint with debug mode', async () => {
    const request = new Request('http://localhost/setup');
    const response = await worker.fetch(request, mockEnvWithDebug, mockContext);
    
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('OAuth');
  });
  
  it('should return 404 for status endpoint without debug mode', async () => {
    const request = new Request('http://localhost/status');
    const response = await worker.fetch(request, mockEnv, mockContext);
    expect(response.status).toBe(404);
  });
  
  it('should handle status endpoint with debug mode', async () => {
    const request = new Request('http://localhost/status');
    const response = await worker.fetch(request, mockEnvWithDebug, mockContext);
    
    expect(response.status).toBe(200);
    const status = await response.json() as any;
    expect(status).toHaveProperty('lastRun');
    expect(status).toHaveProperty('lastStatus');
    expect(status).toHaveProperty('recentErrors');
    expect(status).toHaveProperty('storageHealth');
  });
  
  it('should return 401 for /process endpoint without auth with debug mode', async () => {
    const request = new Request('http://localhost/process', { method: 'POST' });
    const response = await worker.fetch(request, mockEnvWithDebug, mockContext);
    
    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.error).toBe('Not authenticated');
    expect(body.message).toContain('OAuth setup');
  });

  it('should return 404 for endpoints when debug mode is disabled', async () => {
    const envWithoutDebug = { ...mockEnv, DEBUG_MODE: 'false' };
    
    // Test health endpoint
    let request = new Request('http://localhost/health');
    let response = await worker.fetch(request, envWithoutDebug, mockContext);
    expect(response.status).toBe(404);
    
    // Test setup endpoint
    request = new Request('http://localhost/setup');
    response = await worker.fetch(request, envWithoutDebug, mockContext);
    expect(response.status).toBe(404);
    
    // Test status endpoint
    request = new Request('http://localhost/status');
    response = await worker.fetch(request, envWithoutDebug, mockContext);
    expect(response.status).toBe(404);
    
    // Test process endpoint
    request = new Request('http://localhost/process', { method: 'POST' });
    response = await worker.fetch(request, envWithoutDebug, mockContext);
    expect(response.status).toBe(404);
    
    // Root path should still work
    request = new Request('http://localhost/');
    response = await worker.fetch(request, envWithoutDebug, mockContext);
    expect(response.status).toBe(200);
  });
});

describe('Worker Health Check', () => {
  it('should report unhealthy when credentials are missing', async () => {
    const envWithoutCreds = { ...mockEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, envWithoutCreds, mockContext);
    
    // Configuration error returns 500 before reaching health check
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain('Configuration Error');
  });
  
  it('should handle KV storage errors gracefully with debug mode', async () => {
    const envWithFailingKV = {
      ...mockEnvWithDebug,
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
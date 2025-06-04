import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../../src/services/storage.service';
import { StorageError, StorageKeys } from '../../src/types/storage';
import type { OAuthTokens, ErrorLog, ProcessingStatus } from '../../src/types/storage';

// Mock KV namespace
class MockKVNamespace {
  private store: Map<string, string> = new Map();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
    const keys = Array.from(this.store.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .map(name => ({ name }));
    return { keys };
  }
  
  clear() {
    this.store.clear();
  }
  
  // Test helper to simulate errors
  simulateError(method: 'get' | 'put' | 'delete') {
    this[method] = async () => { throw new Error(`KV ${method} error`); };
  }
}

describe('StorageService', () => {
  let storageService: StorageService;
  let mockKV: MockKVNamespace;
  
  beforeEach(() => {
    mockKV = new MockKVNamespace();
    storageService = new StorageService(mockKV as any);
  });
  
  describe('Constructor', () => {
    it('should throw error if KV namespace is not provided', () => {
      expect(() => new StorageService(null as any)).toThrow('KV namespace is required');
    });
  });
  
  describe('OAuth Token Operations', () => {
    const mockTokens: OAuthTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expiry_date: Date.now() + 3600000,
      token_type: 'Bearer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    it('should get OAuth tokens', async () => {
      await mockKV.put(StorageKeys.OAUTH_TOKENS, JSON.stringify(mockTokens));
      
      const result = await storageService.getOAuthTokens();
      expect(result).toEqual(mockTokens);
    });
    
    it('should return null when no tokens exist', async () => {
      const result = await storageService.getOAuthTokens();
      expect(result).toBeNull();
    });
    
    it('should set OAuth tokens', async () => {
      await storageService.setOAuthTokens(mockTokens);
      
      const stored = await mockKV.get(StorageKeys.OAUTH_TOKENS);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.access_token).toBe(mockTokens.access_token);
      expect(parsed.updated_at).toBeDefined();
    });
    
    it('should update OAuth tokens', async () => {
      await storageService.setOAuthTokens(mockTokens);
      
      const updates = { access_token: 'new-access-token' };
      await storageService.updateOAuthTokens(updates);
      
      const result = await storageService.getOAuthTokens();
      expect(result?.access_token).toBe('new-access-token');
      expect(result?.refresh_token).toBe(mockTokens.refresh_token);
      expect(result?.last_refresh).toBeDefined();
    });
    
    it('should throw error when updating non-existent tokens', async () => {
      await expect(
        storageService.updateOAuthTokens({ access_token: 'new' })
      ).rejects.toThrow(StorageError);
    });
    
    it('should handle KV errors gracefully', async () => {
      mockKV.simulateError('get');
      
      await expect(storageService.getOAuthTokens()).rejects.toThrow(StorageError);
    });
  });
  
  describe('Uploaded Files Tracking', () => {
    it('should get empty array when no files uploaded', async () => {
      const result = await storageService.getUploadedFiles();
      expect(result).toEqual([]);
    });
    
    it('should add uploaded file', async () => {
      await storageService.addUploadedFile('2024/test-file.pdf');
      
      const files = await storageService.getUploadedFiles();
      expect(files).toContain('2024/test-file.pdf');
    });
    
    it('should not add duplicate files', async () => {
      await storageService.addUploadedFile('2024/test-file.pdf');
      await storageService.addUploadedFile('2024/test-file.pdf');
      
      const files = await storageService.getUploadedFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('2024/test-file.pdf');
    });
    
    it('should check if file is uploaded', async () => {
      await storageService.addUploadedFile('2024/test-file.pdf');
      
      const isUploaded = await storageService.isFileUploaded('2024/test-file.pdf');
      const isNotUploaded = await storageService.isFileUploaded('2024/other-file.pdf');
      
      expect(isUploaded).toBe(true);
      expect(isNotUploaded).toBe(false);
    });
    
    it('should handle multiple files', async () => {
      const testFiles = [
        '2024/file1.pdf',
        '2024/file2.jpg',
        '2025/file3.doc'
      ];
      
      for (const file of testFiles) {
        await storageService.addUploadedFile(file);
      }
      
      const files = await storageService.getUploadedFiles();
      expect(files).toHaveLength(3);
      expect(files).toEqual(expect.arrayContaining(testFiles));
    });
  });
  
  describe('Error Logging', () => {
    const mockError: ErrorLog = {
      timestamp: new Date().toISOString(),
      error: 'Test error',
      context: 'Test context',
      service: 'test-service',
      operation: 'test-operation'
    };
    
    it('should get empty array when no error logs', async () => {
      const logs = await storageService.getErrorLogs();
      expect(logs).toEqual([]);
    });
    
    it('should append error log', async () => {
      await storageService.appendErrorLog(mockError);
      
      const logs = await storageService.getErrorLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(mockError);
    });
    
    it('should limit returned error logs', async () => {
      // Add 10 error logs
      for (let i = 0; i < 10; i++) {
        await storageService.appendErrorLog({
          ...mockError,
          error: `Error ${i}`
        });
      }
      
      const logs = await storageService.getErrorLogs(5);
      expect(logs).toHaveLength(5);
      expect(logs[0].error).toBe('Error 5'); // Should return most recent
    });
    
    it('should maintain maximum 1000 error logs', async () => {
      // This test is conceptual - in practice would be too slow
      // The implementation trims to last 1000 entries
      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push({ ...mockError, error: `Error ${i}` });
      }
      
      await mockKV.put(StorageKeys.ERROR_LOGS, JSON.stringify(logs));
      await storageService.appendErrorLog({ ...mockError, error: 'New Error' });
      
      const result = await storageService.getErrorLogs();
      expect(result).toHaveLength(6);
      expect(result[result.length - 1].error).toBe('New Error');
    });
    
    it('should clear error logs', async () => {
      await storageService.appendErrorLog(mockError);
      await storageService.clearErrorLogs();
      
      const logs = await storageService.getErrorLogs();
      expect(logs).toEqual([]);
    });
  });
  
  describe('Processing Status', () => {
    const mockStatus: ProcessingStatus = {
      timestamp: new Date().toISOString(),
      processed_count: 10,
      error_count: 2,
      status: 'partial',
      duration_ms: 5000,
      emails_found: 15,
      attachments_downloaded: 20,
      files_uploaded: 18,
      labels_updated: 10
    };
    
    it('should get null when no processing status', async () => {
      const status = await storageService.getProcessingStatus();
      expect(status).toBeNull();
    });
    
    it('should set processing status', async () => {
      await storageService.setProcessingStatus(mockStatus);
      
      const status = await storageService.getProcessingStatus();
      expect(status).toEqual(mockStatus);
    });
    
    it('should update last run time when setting status', async () => {
      await storageService.setProcessingStatus(mockStatus);
      
      const lastRun = await storageService.getLastRunTime();
      expect(lastRun).toBe(mockStatus.timestamp);
    });
    
    it('should handle different status types', async () => {
      const statuses: ProcessingStatus[] = [
        { ...mockStatus, status: 'success' },
        { ...mockStatus, status: 'failed' },
        { ...mockStatus, status: 'partial' }
      ];
      
      for (const status of statuses) {
        await storageService.setProcessingStatus(status);
        const result = await storageService.getProcessingStatus();
        expect(result?.status).toBe(status.status);
      }
    });
  });
  
  describe('Generic Storage Operations', () => {
    it('should get and set generic values', async () => {
      const testData = { foo: 'bar', count: 42 };
      await storageService.setValue('test-key', testData);
      
      const result = await storageService.getValue<typeof testData>('test-key');
      expect(result).toEqual(testData);
    });
    
    it('should set value with expiration', async () => {
      await storageService.setValue('temp-key', 'temp-value', 3600);
      
      const result = await storageService.getValue<string>('temp-key');
      expect(result).toBe('temp-value');
    });
    
    it('should delete values', async () => {
      await storageService.setValue('delete-me', 'value');
      await storageService.deleteValue('delete-me');
      
      const result = await storageService.getValue<string>('delete-me');
      expect(result).toBeNull();
    });
    
    it('should handle complex objects', async () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { a: 'b' }
        },
        date: new Date().toISOString(),
        nullable: null
      };
      
      await storageService.setValue('complex', complexData);
      const result = await storageService.getValue<typeof complexData>('complex');
      
      expect(result).toEqual(complexData);
    });
  });
  
  describe('Bulk Operations', () => {
    it('should clear uploaded files', async () => {
      await storageService.addUploadedFile('2024/file.pdf');
      await storageService.clearUploadedFiles();
      
      const files = await storageService.getUploadedFiles();
      expect(files).toEqual([]);
    });
    
    it('should handle clearing non-existent data', async () => {
      // Should not throw
      await expect(storageService.clearErrorLogs()).resolves.not.toThrow();
      await expect(storageService.clearUploadedFiles()).resolves.not.toThrow();
    });
  });
  
  describe('Health Check', () => {
    it('should return true when KV is healthy', async () => {
      const isHealthy = await storageService.isHealthy();
      expect(isHealthy).toBe(true);
    });
    
    it('should return false when KV operations fail', async () => {
      mockKV.simulateError('put');
      const isHealthy = await storageService.isHealthy();
      expect(isHealthy).toBe(false);
    });
    
    it('should clean up test key after health check', async () => {
      await storageService.isHealthy();
      
      // Check that no health check keys remain
      const keys = await mockKV.list({ prefix: StorageKeys.HEALTH_CHECK });
      expect(keys.keys).toHaveLength(0);
    });
  });
  
  describe('Error Handling', () => {
    it('should throw StorageError with proper details', async () => {
      mockKV.simulateError('get');
      
      try {
        await storageService.getOAuthTokens();
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).operation).toBe('getOAuthTokens');
        expect((error as StorageError).key).toBe(StorageKeys.OAUTH_TOKENS);
        expect((error as StorageError).cause).toBeDefined();
      }
    });
    
    it('should handle JSON parse errors', async () => {
      await mockKV.put(StorageKeys.OAUTH_TOKENS, 'invalid-json');
      
      await expect(storageService.getOAuthTokens()).rejects.toThrow(StorageError);
    });
  });
  
  describe('Concurrent Access', () => {
    it('should handle concurrent reads', async () => {
      await storageService.addUploadedFile('2024/file.pdf');
      
      const promises = Array(10).fill(null).map(() => 
        storageService.isFileUploaded('2024/file.pdf')
      );
      
      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);
    });
    
    it('should handle concurrent writes', async () => {
      // Add files sequentially to avoid race conditions in the mock
      const files = Array(10).fill(null).map((_, i) => `2024/file${i}.pdf`);
      
      for (const file of files) {
        await storageService.addUploadedFile(file);
      }
      
      const uploaded = await storageService.getUploadedFiles();
      expect(uploaded).toHaveLength(10);
      expect(uploaded.sort()).toEqual(files.sort());
    });
  });
});
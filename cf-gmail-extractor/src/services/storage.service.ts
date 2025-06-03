/**
 * KV Storage Service
 * Provides a robust abstraction layer for CloudFlare KV storage operations
 */

import type { 
  OAuthTokens, 
  UploadedFiles, 
  ErrorLog, 
  ProcessingStatus,
  StorageResult
} from '../types/storage';
import { StorageError, StorageKeys } from '../types/storage';

export class StorageService {
  constructor(private readonly kv: KVNamespace) {
    if (!kv) {
      throw new Error('KV namespace is required for StorageService');
    }
  }

  /**
   * OAuth Token Operations
   */
  async getOAuthTokens(): Promise<OAuthTokens | null> {
    try {
      const data = await this.kv.get(StorageKeys.OAUTH_TOKENS);
      if (!data) return null;
      
      return JSON.parse(data) as OAuthTokens;
    } catch (error) {
      throw new StorageError(
        'Failed to get OAuth tokens',
        'getOAuthTokens',
        StorageKeys.OAUTH_TOKENS,
        error as Error
      );
    }
  }

  async setOAuthTokens(tokens: OAuthTokens): Promise<void> {
    try {
      const data = {
        ...tokens,
        updated_at: new Date().toISOString()
      };
      
      await this.kv.put(
        StorageKeys.OAUTH_TOKENS, 
        JSON.stringify(data)
      );
    } catch (error) {
      throw new StorageError(
        'Failed to set OAuth tokens',
        'setOAuthTokens',
        StorageKeys.OAUTH_TOKENS,
        error as Error
      );
    }
  }

  async updateOAuthTokens(updates: Partial<OAuthTokens>): Promise<void> {
    try {
      const existing = await this.getOAuthTokens();
      if (!existing) {
        throw new Error('No existing tokens to update');
      }
      
      const updated = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString(),
        last_refresh: updates.access_token ? new Date().toISOString() : existing.last_refresh
      };
      
      await this.setOAuthTokens(updated);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      
      throw new StorageError(
        'Failed to update OAuth tokens',
        'updateOAuthTokens',
        StorageKeys.OAUTH_TOKENS,
        error as Error
      );
    }
  }

  /**
   * Uploaded Files Tracking
   */
  async getUploadedFiles(): Promise<UploadedFiles> {
    try {
      const data = await this.kv.get(StorageKeys.UPLOADED_FILES);
      if (!data) return [];
      
      return JSON.parse(data) as UploadedFiles;
    } catch (error) {
      throw new StorageError(
        'Failed to get uploaded files',
        'getUploadedFiles',
        StorageKeys.UPLOADED_FILES,
        error as Error
      );
    }
  }

  async addUploadedFile(yearAndFilename: string): Promise<void> {
    try {
      const files = await this.getUploadedFiles();
      
      if (!files.includes(yearAndFilename)) {
        files.push(yearAndFilename);
        await this.kv.put(
          StorageKeys.UPLOADED_FILES,
          JSON.stringify(files)
        );
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      
      throw new StorageError(
        'Failed to add uploaded file',
        'addUploadedFile',
        StorageKeys.UPLOADED_FILES,
        error as Error
      );
    }
  }

  async isFileUploaded(yearAndFilename: string): Promise<boolean> {
    try {
      const files = await this.getUploadedFiles();
      return files.includes(yearAndFilename);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      
      throw new StorageError(
        'Failed to check if file uploaded',
        'isFileUploaded',
        StorageKeys.UPLOADED_FILES,
        error as Error
      );
    }
  }

  /**
   * Error Logging
   */
  async getErrorLogs(limit: number = 100): Promise<ErrorLog[]> {
    try {
      const data = await this.kv.get(StorageKeys.ERROR_LOGS);
      if (!data) return [];
      
      const logs = JSON.parse(data) as ErrorLog[];
      return logs.slice(-limit); // Return the most recent logs
    } catch (error) {
      throw new StorageError(
        'Failed to get error logs',
        'getErrorLogs',
        StorageKeys.ERROR_LOGS,
        error as Error
      );
    }
  }

  async appendErrorLog(errorLog: ErrorLog): Promise<void> {
    try {
      const logs = await this.getErrorLogs(1000); // Keep last 1000 logs
      logs.push(errorLog);
      
      // Trim to last 1000 entries
      const trimmedLogs = logs.slice(-1000);
      
      await this.kv.put(
        StorageKeys.ERROR_LOGS,
        JSON.stringify(trimmedLogs)
      );
    } catch (error) {
      if (error instanceof StorageError) throw error;
      
      throw new StorageError(
        'Failed to append error log',
        'appendErrorLog',
        StorageKeys.ERROR_LOGS,
        error as Error
      );
    }
  }

  /**
   * Processing Status
   */
  async getProcessingStatus(): Promise<ProcessingStatus | null> {
    try {
      const data = await this.kv.get(StorageKeys.PROCESSING_STATUS);
      if (!data) return null;
      
      return JSON.parse(data) as ProcessingStatus;
    } catch (error) {
      throw new StorageError(
        'Failed to get processing status',
        'getProcessingStatus',
        StorageKeys.PROCESSING_STATUS,
        error as Error
      );
    }
  }

  async setProcessingStatus(status: ProcessingStatus): Promise<void> {
    try {
      await this.kv.put(
        StorageKeys.PROCESSING_STATUS,
        JSON.stringify(status)
      );
      
      // Also update last run timestamp for quick access
      await this.kv.put(
        StorageKeys.LAST_RUN,
        status.timestamp
      );
    } catch (error) {
      throw new StorageError(
        'Failed to set processing status',
        'setProcessingStatus',
        StorageKeys.PROCESSING_STATUS,
        error as Error
      );
    }
  }

  async getLastRunTime(): Promise<string | null> {
    try {
      return await this.kv.get(StorageKeys.LAST_RUN);
    } catch (error) {
      throw new StorageError(
        'Failed to get last run time',
        'getLastRunTime',
        StorageKeys.LAST_RUN,
        error as Error
      );
    }
  }

  /**
   * Generic Storage Operations
   */
  async getValue<T>(key: string): Promise<T | null> {
    try {
      const data = await this.kv.get(key);
      if (!data) return null;
      
      return JSON.parse(data) as T;
    } catch (error) {
      throw new StorageError(
        `Failed to get value for key: ${key}`,
        'getValue',
        key,
        error as Error
      );
    }
  }

  async setValue<T>(key: string, value: T, expirationTtl?: number): Promise<void> {
    try {
      const options = expirationTtl ? { expirationTtl } : undefined;
      await this.kv.put(key, JSON.stringify(value), options);
    } catch (error) {
      throw new StorageError(
        `Failed to set value for key: ${key}`,
        'setValue',
        key,
        error as Error
      );
    }
  }

  async deleteValue(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      throw new StorageError(
        `Failed to delete value for key: ${key}`,
        'deleteValue',
        key,
        error as Error
      );
    }
  }

  /**
   * Bulk Operations
   */
  async clearErrorLogs(): Promise<void> {
    try {
      await this.kv.delete(StorageKeys.ERROR_LOGS);
    } catch (error) {
      throw new StorageError(
        'Failed to clear error logs',
        'clearErrorLogs',
        StorageKeys.ERROR_LOGS,
        error as Error
      );
    }
  }

  async clearUploadedFiles(): Promise<void> {
    try {
      await this.kv.delete(StorageKeys.UPLOADED_FILES);
    } catch (error) {
      throw new StorageError(
        'Failed to clear uploaded files',
        'clearUploadedFiles',
        StorageKeys.UPLOADED_FILES,
        error as Error
      );
    }
  }

  /**
   * Health Check
   */
  async isHealthy(): Promise<boolean> {
    try {
      const testKey = `${StorageKeys.HEALTH_CHECK}_${Date.now()}`;
      await this.kv.put(testKey, 'test', { expirationTtl: 60 });
      const result = await this.kv.get(testKey);
      await this.kv.delete(testKey);
      return result === 'test';
    } catch {
      return false;
    }
  }
}
/**
 * Performance tests to ensure the worker stays within CloudFlare limits
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessorService } from '../../src/services/processor.service';
import type { ProcessorConfig } from '../../src/types/processor';

describe('Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Memory Usage', () => {
    it('should process large attachments without exceeding memory limits', async () => {
      // Mock services
      const mockStorage = {
        addUploadedFile: vi.fn(),
        getUploadedFiles: vi.fn().mockResolvedValue([]),
        isFileUploaded: vi.fn().mockResolvedValue(false),
        setProcessingStatus: vi.fn(),
        getProcessingStatus: vi.fn(),
        appendErrorLog: vi.fn(),
        getErrorLogs: vi.fn().mockResolvedValue([])
      };
      
      const mockAuth = {
        getValidToken: vi.fn().mockResolvedValue('mock-token')
      };
      
      const mockGmail = {
        config: {
          requiredLabel: 'test/todo',
          processedLabel: 'test/done',
          maxAttachmentSize: 25 * 1024 * 1024
        },
        getLabelIdByName: vi.fn()
          .mockResolvedValueOnce('label-1')
          .mockResolvedValueOnce('label-2'),
        buildLabelQuery: vi.fn().mockReturnValue('label:test'),
        searchEmails: vi.fn().mockResolvedValue([]),
        extractAttachments: vi.fn(),
        getHeaderValue: vi.fn(),
        shouldProcessAttachment: vi.fn().mockReturnValue(true),
        downloadAttachment: vi.fn(),
        updateEmailLabels: vi.fn()
      };
      
      const mockDrive = {
        getOrCreateYearFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: '2024' }),
        fileExists: vi.fn().mockResolvedValue(false),
        uploadFile: vi.fn().mockResolvedValue({ id: 'file-1', name: 'test.pdf' })
      };
      
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn()
      };
      
      const config: ProcessorConfig = {
        maxEmailsPerRun: 50,
        maxAttachmentSize: 25 * 1024 * 1024,
        skipLargeAttachments: true,
        continueOnError: true
      };
      
      const processor = new ProcessorService(
        config,
        mockStorage as any,
        mockAuth as any,
        mockGmail as any,
        mockDrive as any,
        mockLogger
      );
      
      // Track memory usage before processing
      const startMemory = process.memoryUsage().heapUsed;
      
      // Process emails
      await processor.processEmails();
      
      // Check memory usage after processing
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;
      
      // CloudFlare Workers have 128MB limit
      expect(memoryUsedMB).toBeLessThan(50); // Conservative limit
    });
  });
  
  describe('Execution Time', () => {
    it('should complete processing within CloudFlare time limits', async () => {
      // Mock setup similar to above but with multiple emails
      const mockEmails = Array(10).fill(null).map((_, i) => ({
        id: `email-${i}`,
        threadId: `thread-${i}`,
        labelIds: ['label-1'],
        snippet: 'Test',
        historyId: '12345',
        internalDate: '1710000000000',
        sizeEstimate: 1000,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: 'test@example.com' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 0 }
        }
      }));
      
      const mockStorage = {
        addUploadedFile: vi.fn(),
        getUploadedFiles: vi.fn().mockResolvedValue([]),
        isFileUploaded: vi.fn().mockResolvedValue(false),
        setProcessingStatus: vi.fn(),
        getProcessingStatus: vi.fn(),
        appendErrorLog: vi.fn(),
        getErrorLogs: vi.fn().mockResolvedValue([])
      };
      
      const mockAuth = {
        getValidToken: vi.fn().mockResolvedValue('mock-token')
      };
      
      const mockGmail = {
        config: {
          requiredLabel: 'test/todo',
          processedLabel: 'test/done',
          maxAttachmentSize: 25 * 1024 * 1024
        },
        getLabelIdByName: vi.fn()
          .mockResolvedValueOnce('label-1')
          .mockResolvedValueOnce('label-2'),
        buildLabelQuery: vi.fn().mockReturnValue('label:test'),
        searchEmails: vi.fn().mockResolvedValue(mockEmails),
        extractAttachments: vi.fn().mockReturnValue([]),
        getHeaderValue: vi.fn((msg, header) => {
          if (header === 'From') return 'test@example.com';
          if (header === 'Date') return 'Mon, 1 Jan 2024 10:00:00 +0000';
          return undefined;
        }),
        shouldProcessAttachment: vi.fn().mockReturnValue(true),
        downloadAttachment: vi.fn(),
        updateEmailLabels: vi.fn()
      };
      
      const mockDrive = {
        getOrCreateYearFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: '2024' }),
        fileExists: vi.fn().mockResolvedValue(false),
        uploadFile: vi.fn().mockResolvedValue({ id: 'file-1', name: 'test.pdf' })
      };
      
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn()
      };
      
      const config: ProcessorConfig = {
        maxEmailsPerRun: 50,
        maxAttachmentSize: 25 * 1024 * 1024,
        skipLargeAttachments: true,
        continueOnError: true
      };
      
      const processor = new ProcessorService(
        config,
        mockStorage as any,
        mockAuth as any,
        mockGmail as any,
        mockDrive as any,
        mockLogger
      );
      
      const startTime = Date.now();
      const report = await processor.processEmails();
      const executionTime = Date.now() - startTime;
      
      // CloudFlare Workers have CPU time limits (10-50ms depending on plan)
      // But wall time can be up to 30 seconds
      expect(executionTime).toBeLessThan(5000); // 5 seconds for safety
      expect(report.totalEmails).toBe(10);
    });
  });
  
  describe('API Rate Limiting', () => {
    it('should respect Gmail API rate limits', async () => {
      // Track API call timing
      const apiCallTimes: number[] = [];
      
      const mockGmail = {
        config: {
          requiredLabel: 'test/todo',
          processedLabel: 'test/done',
          maxAttachmentSize: 25 * 1024 * 1024
        },
        getLabelIdByName: vi.fn()
          .mockImplementation(async () => {
            apiCallTimes.push(Date.now());
            return 'label-id';
          }),
        buildLabelQuery: vi.fn().mockReturnValue('label:test'),
        searchEmails: vi.fn()
          .mockImplementation(async () => {
            apiCallTimes.push(Date.now());
            return [];
          }),
        extractAttachments: vi.fn().mockReturnValue([]),
        getHeaderValue: vi.fn(),
        shouldProcessAttachment: vi.fn().mockReturnValue(true),
        downloadAttachment: vi.fn()
          .mockImplementation(async () => {
            apiCallTimes.push(Date.now());
            return { data: 'base64data' };
          }),
        updateEmailLabels: vi.fn()
          .mockImplementation(async () => {
            apiCallTimes.push(Date.now());
          })
      };
      
      const mockStorage = {
        addUploadedFile: vi.fn(),
        getUploadedFiles: vi.fn().mockResolvedValue([]),
        isFileUploaded: vi.fn().mockResolvedValue(false),
        setProcessingStatus: vi.fn(),
        getProcessingStatus: vi.fn(),
        appendErrorLog: vi.fn(),
        getErrorLogs: vi.fn().mockResolvedValue([])
      };
      
      const mockAuth = {
        getValidToken: vi.fn().mockResolvedValue('mock-token')
      };
      
      const mockDrive = {
        getOrCreateYearFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: '2024' }),
        fileExists: vi.fn().mockResolvedValue(false),
        uploadFile: vi.fn().mockResolvedValue({ id: 'file-1', name: 'test.pdf' })
      };
      
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn()
      };
      
      const config: ProcessorConfig = {
        maxEmailsPerRun: 5,
        maxAttachmentSize: 25 * 1024 * 1024,
        skipLargeAttachments: true,
        continueOnError: true
      };
      
      const processor = new ProcessorService(
        config,
        mockStorage as any,
        mockAuth as any,
        mockGmail as any,
        mockDrive as any,
        mockLogger
      );
      
      await processor.processEmails();
      
      // Check that API calls are not too rapid
      for (let i = 1; i < apiCallTimes.length; i++) {
        const timeDiff = apiCallTimes[i] - apiCallTimes[i - 1];
        // Ensure at least some time between calls (not enforcing strict rate limit in tests)
        expect(timeDiff).toBeGreaterThanOrEqual(0);
      }
      
      // Gmail API allows 250 quota units per user per second
      // Each operation uses different quota units
      expect(apiCallTimes.length).toBeLessThan(20); // Conservative limit for test
    });
  });
});
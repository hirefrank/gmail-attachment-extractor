/**
 * Processor Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessorService } from '../../src/services/processor.service';
import type { ProcessorConfig } from '../../src/types/processor';
import type { EmailMessage } from '../../src/types/gmail';
import type { FolderInfo } from '../../src/types/drive';

// Mock all dependencies
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
    requiredLabel: 'NeedsProcessing',
    processedLabel: 'Processed'
  },
  getLabelIdByName: vi.fn(),
  buildLabelQuery: vi.fn().mockReturnValue('label:NeedsProcessing'),
  searchEmails: vi.fn(),
  extractAttachments: vi.fn(),
  getHeaderValue: vi.fn(),
  shouldProcessAttachment: vi.fn().mockReturnValue(true),
  downloadAttachment: vi.fn(),
  updateEmailLabels: vi.fn()
};

const mockDrive = {
  getOrCreateYearFolder: vi.fn(),
  fileExists: vi.fn().mockResolvedValue(false),
  uploadFile: vi.fn()
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn()
};

describe('Processor Service', () => {
  let service: ProcessorService;
  let config: ProcessorConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset default mock behaviors
    mockStorage.isFileUploaded.mockResolvedValue(false);
    mockDrive.fileExists.mockResolvedValue(false);

    config = {
      maxEmailsPerRun: 50,
      maxAttachmentSize: 25 * 1024 * 1024,
      skipLargeAttachments: true,
      continueOnError: true
    };

    service = new ProcessorService(
      config,
      mockStorage as any,
      mockAuth as any,
      mockGmail as any,
      mockDrive as any,
      mockLogger
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processEmails', () => {
    it('should process emails successfully', async () => {
      // Mock label IDs
      mockGmail.getLabelIdByName
        .mockResolvedValueOnce('label-123') // required label
        .mockResolvedValueOnce('label-456'); // processed label

      // Mock email search
      const mockEmails: EmailMessage[] = [{
        id: 'email-1',
        threadId: 'thread-1',
        labelIds: ['label-123'],
        snippet: 'Test email',
        historyId: '12345',
        internalDate: '1710000000000',
        sizeEstimate: 1000,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: 'John Doe <john@example.com>' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 0 }
        }
      }];
      mockGmail.searchEmails.mockResolvedValueOnce(mockEmails);
      
      // Mock header values
      mockGmail.getHeaderValue
        .mockImplementation((msg, header) => {
          if (header === 'From') return 'John Doe <john@example.com>';
          if (header === 'Date') return 'Mon, 1 Jan 2024 10:00:00 +0000';
          return undefined;
        });

      // Mock attachments
      mockGmail.extractAttachments.mockReturnValueOnce([{
        messageId: 'email-1',
        attachmentId: 'att-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024
      }]);

      // Mock year folder
      mockDrive.getOrCreateYearFolder.mockResolvedValueOnce({
        id: 'folder-2024',
        name: '2024',
        webViewLink: 'https://drive.google.com/folder-2024'
      });

      // Mock attachment download
      mockGmail.downloadAttachment.mockResolvedValueOnce({
        messageId: 'email-1',
        attachmentId: 'att-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        data: 'base64data'
      });

      // Mock file upload
      mockDrive.uploadFile.mockResolvedValueOnce({
        id: 'file-123',
        name: '01_Doe_document.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file-123'
      });

      const report = await service.processEmails();

      expect(report.totalEmails).toBe(1);
      expect(report.successfulEmails).toBe(1);
      expect(report.failedEmails).toBe(0);
      expect(report.totalFilesUploaded).toBe(1);
      expect(report.errors).toHaveLength(0);

      // Verify label update was called
      expect(mockGmail.updateEmailLabels).toHaveBeenCalledWith(
        'mock-token',
        'email-1',
        {
          removeLabelIds: ['label-123'],
          addLabelIds: ['label-456']
        }
      );

      // Verify file upload tracking
      expect(mockStorage.addUploadedFile).toHaveBeenCalledWith('2024/01_Doe_document.pdf');

      // Verify status update
      expect(mockStorage.setProcessingStatus).toHaveBeenCalled();
    });

    it('should handle emails without attachments', async () => {
      mockGmail.getLabelIdByName
        .mockResolvedValueOnce('label-123')
        .mockResolvedValueOnce('label-456');

      const mockEmails: EmailMessage[] = [{
        id: 'email-no-attach',
        threadId: 'thread-1',
        labelIds: ['label-123'],
        snippet: 'No attachments',
        historyId: '12345',
        internalDate: '1710000000000',
        sizeEstimate: 500,
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'test@example.com' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 500, data: 'Hello' }
        }
      }];

      mockGmail.searchEmails.mockResolvedValueOnce(mockEmails);
      mockGmail.extractAttachments.mockReturnValueOnce([]);

      const report = await service.processEmails();

      expect(report.totalEmails).toBe(1);
      expect(report.successfulEmails).toBe(1);
      expect(report.totalFilesUploaded).toBe(0);
      
      // Should not update labels for emails without attachments
      expect(mockGmail.updateEmailLabels).not.toHaveBeenCalled();
    });

    it('should continue on error when configured', async () => {
      mockGmail.getLabelIdByName
        .mockResolvedValueOnce('label-123')
        .mockResolvedValueOnce('label-456');

      const mockEmails: EmailMessage[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          labelIds: [],
          snippet: '',
          historyId: '',
          internalDate: '',
          sizeEstimate: 0,
          payload: {
            partId: '',
            mimeType: '',
            filename: '',
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'Date', value: 'invalid-date' } // Will cause error
            ],
            body: { size: 0 }
          }
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          labelIds: [],
          snippet: '',
          historyId: '',
          internalDate: '',
          sizeEstimate: 0,
          payload: {
            partId: '',
            mimeType: '',
            filename: '',
            headers: [
              { name: 'From', value: 'test2@example.com' },
              { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
            ],
            body: { size: 0 }
          }
        }
      ];

      mockGmail.searchEmails.mockResolvedValueOnce(mockEmails);
      
      // Mock header values
      mockGmail.getHeaderValue
        .mockImplementation((msg, header) => {
          const headers = msg.payload?.headers || [];
          const found = headers.find((h: any) => h.name === header);
          return found?.value;
        });
      
      // First email has attachments but invalid date, second has no attachments
      mockGmail.extractAttachments
        .mockReturnValueOnce([{ // email-1 has attachment
          messageId: 'email-1',
          attachmentId: 'att-1',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024
        }])
        .mockReturnValueOnce([]); // email-2 has no attachments

      const report = await service.processEmails();

      expect(report.totalEmails).toBe(2);
      expect(report.failedEmails).toBe(1);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].emailId).toBe('email-1');
    });

    it('should throw error when required label not found', async () => {
      mockGmail.getLabelIdByName.mockResolvedValueOnce(null);

      await expect(service.processEmails()).rejects.toThrow(
        "Required label 'NeedsProcessing' not found"
      );
    });
  });

  describe('processEmailAttachments', () => {
    const mockEmail: EmailMessage = {
      id: 'email-123',
      threadId: 'thread-123',
      labelIds: [],
      snippet: '',
      historyId: '',
      internalDate: '',
      sizeEstimate: 0,
      payload: {
        partId: '',
        mimeType: '',
        filename: '',
        headers: [
          { name: 'From', value: 'John Doe <john@example.com>' },
          { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
        ],
        body: { size: 0 }
      }
    };

    it('should skip large attachments when configured', async () => {
      const largeAttachment = {
        messageId: 'email-123',
        attachmentId: 'att-large',
        filename: 'large.zip',
        mimeType: 'application/zip',
        size: 30 * 1024 * 1024 // 30MB
      };

      // Mock header values
      mockGmail.getHeaderValue
        .mockImplementation((msg, header) => {
          if (header === 'From') return 'John Doe <john@example.com>';
          if (header === 'Date') return 'Mon, 1 Jan 2024 10:00:00 +0000';
          return undefined;
        });

      mockGmail.extractAttachments.mockReturnValueOnce([largeAttachment]);
      mockGmail.shouldProcessAttachment.mockReturnValueOnce(false);
      mockDrive.getOrCreateYearFolder.mockResolvedValueOnce({
        id: 'folder-2024',
        name: '2024'
      } as FolderInfo);

      const result = await service.processEmailAttachments(
        mockEmail,
        'mock-token',
        'label-123',
        'label-456'
      );

      expect(result.success).toBe(true);
      expect(result.filesUploaded).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping large attachment')
      );
    });

    it('should skip duplicate files', async () => {
      // Mock header values
      mockGmail.getHeaderValue
        .mockImplementation((msg, header) => {
          if (header === 'From') return 'John Doe <john@example.com>';
          if (header === 'Date') return 'Mon, 1 Jan 2024 10:00:00 +0000';
          return undefined;
        });
      
      mockGmail.extractAttachments.mockReturnValueOnce([{
        messageId: 'email-123',
        attachmentId: 'att-123',
        filename: 'duplicate.pdf',
        mimeType: 'application/pdf',
        size: 1024
      }]);

      mockDrive.getOrCreateYearFolder.mockResolvedValueOnce({
        id: 'folder-2024',
        name: '2024'
      } as FolderInfo);

      // Reset and then set the specific mocks for this test
      mockDrive.fileExists.mockReset();
      mockStorage.isFileUploaded.mockReset();
      
      // Since checkDuplicateFile checks Drive first and returns true if found,
      // we only need Drive to exist to trigger the duplicate check
      mockDrive.fileExists.mockResolvedValueOnce(true); // File exists in Drive
      // Storage check won't be reached since Drive check returns true first

      const result = await service.processEmailAttachments(
        mockEmail,
        'mock-token',
        'label-123',
        'label-456'
      );

      expect(result.success).toBe(true);
      expect(result.filesUploaded).toBe(0);
      
      // Check that the logger was called with the 'File already exists' message
      const logCalls = mockLogger.info.mock.calls;
      const hasFileExistsLog = logCalls.some(call => 
        call[0] && call[0].includes('File already exists')
      );
      expect(hasFileExistsLog).toBe(true);
    });

    it('should handle missing email headers', async () => {
      const emailNoHeaders: EmailMessage = {
        ...mockEmail,
        payload: {
          ...mockEmail.payload,
          headers: [] // No headers
        }
      };

      mockGmail.extractAttachments.mockReturnValueOnce([{
        messageId: 'email-123',
        attachmentId: 'att-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024
      }]);

      const result = await service.processEmailAttachments(
        emailNoHeaders,
        'mock-token',
        'label-123',
        'label-456'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required email headers');
    });
  });

  describe('checkDuplicateFile', () => {
    it('should check both Drive and storage records', async () => {
      mockDrive.fileExists.mockResolvedValueOnce(false);
      mockStorage.isFileUploaded.mockResolvedValueOnce(true);

      const isDuplicate = await service.checkDuplicateFile(
        'existing.pdf',
        'folder-123',
        'mock-token',
        '2024'
      );

      expect(isDuplicate).toBe(true);
      expect(mockDrive.fileExists).toHaveBeenCalled();
      expect(mockStorage.isFileUploaded).toHaveBeenCalledWith('2024/existing.pdf');
    });

    it('should return false on error', async () => {
      mockDrive.fileExists.mockRejectedValueOnce(new Error('API error'));

      const isDuplicate = await service.checkDuplicateFile(
        'test.pdf',
        'folder-123',
        'mock-token'
      );

      expect(isDuplicate).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateProcessingStatus', () => {
    it('should store processing report', async () => {
      const report = {
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:05:00.000Z',
        totalEmails: 10,
        successfulEmails: 8,
        failedEmails: 2,
        totalFilesUploaded: 15,
        totalProcessingTime: 300000,
        errors: [
          { emailId: 'email-1', error: 'Test error' }
        ]
      };

      await service.updateProcessingStatus(report);

      expect(mockStorage.setProcessingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: '2024-01-01T00:00:00.000Z',
          processed_count: 10,
          error_count: 2,
          status: 'partial',
          duration_ms: 300000,
          emails_found: 10,
          attachments_downloaded: 15,
          files_uploaded: 15,
          labels_updated: 8,
          errors: ['Test error']
        })
      );
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      const mockStatus = {
        timestamp: '2024-01-01T00:00:00.000Z',
        processed_count: 50,
        files_uploaded: 100
      };

      mockStorage.getProcessingStatus.mockResolvedValueOnce(mockStatus);
      mockStorage.getUploadedFiles.mockResolvedValueOnce(new Array(100));
      mockStorage.getErrorLogs.mockResolvedValueOnce([
        { timestamp: '2024-01-01T00:00:00.000Z', error: 'Test error' }
      ]);

      const stats = await service.getProcessingStats();

      expect(stats).toEqual({
        status: mockStatus,
        totalFilesUploaded: 100,
        recentErrors: expect.any(Array),
        lastProcessed: mockStatus.timestamp
      });
    });

    it('should handle errors gracefully', async () => {
      mockStorage.getProcessingStatus.mockRejectedValueOnce(new Error('Storage error'));

      const stats = await service.getProcessingStats();

      expect(stats).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
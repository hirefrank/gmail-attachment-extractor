/**
 * Gmail Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailService } from '../../src/services/gmail.service';
import { GmailApiError } from '../../src/types/gmail';
import type { 
  EmailMessage, 
  GmailServiceConfig,
  EmailSearchOptions,
  LabelModification
} from '../../src/types/gmail';

// Mock fetch globally
global.fetch = vi.fn();

describe('Gmail Service', () => {
  let service: GmailService;
  let mockLogger: any;
  let config: GmailServiceConfig;
  const mockToken = 'mock-access-token';

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    config = {
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      requiredLabel: 'NeedsProcessing',
      processedLabel: 'Processed',
      errorLabel: 'ProcessingError'
    };

    service = new GmailService(config, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchEmails', () => {
    it('should search emails with query', async () => {
      const mockListResponse = {
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' }
        ]
      };

      const mockMessage1: EmailMessage = {
        id: 'msg1',
        threadId: 'thread1',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Test email 1',
        historyId: '12345',
        internalDate: '1710000000000',
        sizeEstimate: 1000,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [
            { name: 'From', value: 'test@example.com' },
            { name: 'Subject', value: 'Test Subject' }
          ],
          body: { size: 0 },
          parts: []
        }
      };

      const mockMessage2 = { ...mockMessage1, id: 'msg2' };

      // Mock list response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockListResponse
      });

      // Mock individual message fetches
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMessage1
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMessage2
        });

      const options: EmailSearchOptions = {
        query: 'label:NeedsProcessing',
        maxResults: 10
      };

      const results = await service.searchEmails(mockToken, options);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('msg1');
      expect(results[1].id).toBe('msg2');
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=label%3ANeedsProcessing'),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer mock-access-token',
            'Accept': 'application/json'
          }
        })
      );
    });

    it('should handle empty search results', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] })
      });

      const results = await service.searchEmails(mockToken, { query: 'label:NotFound' });
      
      expect(results).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('No messages found for query: label:NotFound');
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 401,
            message: 'Invalid credentials',
            errors: [{ reason: 'authError' }]
          }
        })
      });

      await expect(
        service.searchEmails(mockToken, { query: 'test' })
      ).rejects.toThrow(GmailApiError);
    });
  });

  describe('getEmailDetails', () => {
    it('should fetch email details', async () => {
      const mockMessage: EmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: ['INBOX'],
        snippet: 'Test email',
        historyId: '12345',
        internalDate: '1710000000000',
        sizeEstimate: 1000,
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 100, data: 'SGVsbG8gV29ybGQ=' }
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage
      });

      const result = await service.getEmailDetails(mockToken, 'msg123');

      expect(result).toEqual(mockMessage);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg123',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer mock-access-token',
            'Accept': 'application/json'
          }
        })
      );
    });

    it('should handle invalid message structure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg123' }) // Missing payload
      });

      const result = await service.getEmailDetails(mockToken, 'msg123');
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid message structure for ID: msg123');
    });
  });

  describe('downloadAttachment', () => {
    it('should download attachment data', async () => {
      const mockAttachmentData = {
        size: 1024,
        data: 'base64EncodedData...'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAttachmentData
      });

      const result = await service.downloadAttachment(mockToken, {
        messageId: 'msg123',
        attachmentId: 'att456'
      });

      expect(result).toEqual({
        messageId: 'msg123',
        attachmentId: 'att456',
        filename: '',
        mimeType: '',
        size: 1024,
        data: 'base64EncodedData...'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg123/attachments/att456',
        expect.any(Object)
      );
    });

    it('should handle download errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 404, message: 'Attachment not found' }
        })
      });

      await expect(
        service.downloadAttachment(mockToken, {
          messageId: 'msg123',
          attachmentId: 'invalid'
        })
      ).rejects.toThrow(GmailApiError);
    });
  });

  describe('updateEmailLabels', () => {
    it('should add and remove labels', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      const modification: LabelModification = {
        addLabelIds: ['Label_1', 'Label_2'],
        removeLabelIds: ['Label_3']
      };

      await service.updateEmailLabels(mockToken, 'msg123', modification);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg123/modify',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-access-token',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(modification)
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Updated labels for message msg123');
    });
  });

  describe('listLabels', () => {
    it('should return list of labels', async () => {
      const mockLabels = {
        labels: [
          { id: 'Label_1', name: 'NeedsProcessing', type: 'user' },
          { id: 'Label_2', name: 'Processed', type: 'user' },
          { id: 'INBOX', name: 'INBOX', type: 'system' }
        ]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLabels
      });

      const labels = await service.listLabels(mockToken);

      expect(labels).toHaveLength(3);
      expect(labels[0].name).toBe('NeedsProcessing');
    });

    it('should handle empty labels list', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      const labels = await service.listLabels(mockToken);
      expect(labels).toEqual([]);
    });
  });

  describe('extractAttachments', () => {
    it('should extract attachments from message', () => {
      const message: EmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        historyId: '',
        internalDate: '',
        sizeEstimate: 0,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [],
          body: { size: 0 },
          parts: [
            {
              partId: '1',
              mimeType: 'text/plain',
              filename: '',
              headers: [],
              body: { size: 100 }
            },
            {
              partId: '2',
              mimeType: 'application/pdf',
              filename: 'document.pdf',
              headers: [],
              body: { attachmentId: 'att123', size: 50000 }
            },
            {
              partId: '3',
              mimeType: 'image/jpeg',
              filename: 'photo.jpg',
              headers: [],
              body: { attachmentId: 'att456', size: 25000 }
            }
          ]
        }
      };

      const attachments = service.extractAttachments(message);

      expect(attachments).toHaveLength(2);
      expect(attachments[0]).toEqual({
        messageId: 'msg123',
        attachmentId: 'att123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 50000
      });
      expect(attachments[1]).toEqual({
        messageId: 'msg123',
        attachmentId: 'att456',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 25000
      });
    });

    it('should handle nested multipart messages', () => {
      const message: EmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        historyId: '',
        internalDate: '',
        sizeEstimate: 0,
        payload: {
          partId: '',
          mimeType: 'multipart/mixed',
          filename: '',
          headers: [],
          body: { size: 0 },
          parts: [
            {
              partId: '1',
              mimeType: 'multipart/alternative',
              filename: '',
              headers: [],
              body: { size: 0 },
              parts: [
                {
                  partId: '1.1',
                  mimeType: 'text/plain',
                  filename: '',
                  headers: [],
                  body: { size: 100 }
                },
                {
                  partId: '1.2',
                  mimeType: 'text/html',
                  filename: '',
                  headers: [],
                  body: { size: 200 }
                }
              ]
            },
            {
              partId: '2',
              mimeType: 'application/pdf',
              filename: 'nested.pdf',
              headers: [],
              body: { attachmentId: 'att789', size: 30000 }
            }
          ]
        }
      };

      const attachments = service.extractAttachments(message);
      
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('nested.pdf');
    });
  });

  describe('getHeaderValue', () => {
    it('should extract header value', () => {
      const message: EmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        historyId: '',
        internalDate: '',
        sizeEstimate: 0,
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
          ],
          body: { size: 0 }
        }
      };

      expect(service.getHeaderValue(message, 'From')).toBe('sender@example.com');
      expect(service.getHeaderValue(message, 'subject')).toBe('Test Subject'); // Case insensitive
      expect(service.getHeaderValue(message, 'NonExistent')).toBeUndefined();
    });
  });

  describe('shouldProcessAttachment', () => {
    it('should allow attachments within size limit', () => {
      const attachment = {
        messageId: 'msg123',
        attachmentId: 'att123',
        filename: 'small.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 1024 // 1MB
      };

      expect(service.shouldProcessAttachment(attachment)).toBe(true);
    });

    it('should reject attachments exceeding size limit', () => {
      const attachment = {
        messageId: 'msg123',
        attachmentId: 'att123',
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        size: 30 * 1024 * 1024 // 30MB
      };

      expect(service.shouldProcessAttachment(attachment)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping attachment large.pdf')
      );
    });
  });

  describe('validateLabel', () => {
    it('should find existing label', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [
            { id: 'Label_1', name: 'NeedsProcessing' },
            { id: 'Label_2', name: 'Processed' }
          ]
        })
      });

      const label = await service.validateLabel(mockToken, 'NeedsProcessing');
      
      expect(label).toEqual({ id: 'Label_1', name: 'NeedsProcessing' });
    });

    it('should return null for non-existent label', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [
            { id: 'Label_1', name: 'SomeLabel' }
          ]
        })
      });

      const label = await service.validateLabel(mockToken, 'NonExistent');
      
      expect(label).toBeNull();
    });
  });

  describe('getLabelIdByName', () => {
    it('should return label ID for existing label', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [
            { id: 'Label_123', name: 'NeedsProcessing' }
          ]
        })
      });

      const labelId = await service.getLabelIdByName(mockToken, 'NeedsProcessing');
      
      expect(labelId).toBe('Label_123');
    });

    it('should return null for non-existent label', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ labels: [] })
      });

      const labelId = await service.getLabelIdByName(mockToken, 'NonExistent');
      
      expect(labelId).toBeNull();
    });
  });

  describe('buildLabelQuery', () => {
    it('should build proper label query', () => {
      expect(service.buildLabelQuery('Label_123')).toBe('label:Label_123');
    });
  });

  describe('error handling', () => {
    it('should parse Gmail API error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 403,
            message: 'Insufficient permissions',
            errors: [{
              domain: 'global',
              reason: 'forbidden',
              message: 'Insufficient permissions'
            }]
          }
        })
      });

      try {
        await service.searchEmails(mockToken, { query: 'test' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(GmailApiError);
        expect((error as GmailApiError).code).toBe(403);
        expect((error as GmailApiError).reason).toBe('forbidden');
      }
    });

    it('should handle non-JSON error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON'); }
      });

      try {
        await service.searchEmails(mockToken, { query: 'test' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(GmailApiError);
        expect((error as GmailApiError).message).toContain('500 Internal Server Error');
      }
    });
  });
});
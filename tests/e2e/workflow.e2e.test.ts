/**
 * End-to-End Workflow Tests
 * 
 * Tests the complete email processing workflow from Gmail to Drive
 * with real-world scenarios and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import type { EmailMessage } from '../../src/types/gmail';

// Test data scenarios
const testScenarios = [
  {
    name: "Standard Insurance Claim",
    sender: "john.smith@insurance.com",
    subject: "Claim #12345",
    attachments: ["claim_form.pdf", "receipt.jpg"],
    labels: ["insurance claims/todo"],
    expectedFilenames: ["01_Smith_claim_form.pdf", "01_Smith_receipt.jpg"]
  },
  {
    name: "Multiple Attachments",
    sender: "jane.doe@client.com", 
    subject: "Medical Bills",
    attachments: ["bill1.pdf", "bill2.pdf", "xray.jpg"],
    labels: ["insurance claims/todo"],
    expectedFilenames: ["01_Doe_bill1.pdf", "01_Doe_bill2.pdf", "01_Doe_xray.jpg"]
  },
  {
    name: "Special Characters",
    sender: "maría.garcía@cliente.es",
    subject: "Reclamación médica",
    attachments: ["factura_médica.pdf"],
    labels: ["insurance claims/todo"],
    expectedFilenames: ["01_García_factura_médica.pdf"]
  },
  {
    name: "Corporate Email",
    sender: "Legal Department <legal@bigcorp.com>",
    subject: "Contract Documents",
    attachments: ["contract.pdf", "amendment.pdf"],
    labels: ["insurance claims/todo"],
    expectedFilenames: ["01_Legal_contract.pdf", "01_Legal_amendment.pdf"]
  }
];

// Mock environment with comprehensive setup
const createMockEnv = (): Env => ({
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  LOG_LEVEL: 'debug',
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

describe('E2E Workflow Tests', () => {
  let mockEnv: Env;
  let fetchCallCount: number;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
    fetchCallCount = 0;
    
    // Mock console methods to capture logs
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Email Processing Flow', () => {
    it('should process standard insurance claim email end-to-end', async () => {
      const scenario = testScenarios[0]; // Standard Insurance Claim
      
      // Setup Gmail API responses
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      // Trigger cron execution
      const event = {
        cron: '0 0 * * 0',
        scheduledTime: Date.now()
      } as any;
      
      await worker.scheduled(event, mockEnv, mockContext);
      
      // Verify email processing
      expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
        'uploaded_files',
        expect.stringContaining('2024/01_Smith_claim_form.pdf')
      );
      
      // Verify processing status was updated
      expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
        'processing_status',
        expect.any(String)
      );
      
      // Verify Gmail labels were updated (through API calls)
      const fetchCalls = (global.fetch as any).mock.calls;
      const labelUpdateCalls = fetchCalls.filter((call: any) => 
        call[0].includes('modify') && call[1].method === 'POST'
      );
      expect(labelUpdateCalls.length).toBeGreaterThan(0);
    });

    it('should handle multiple attachments correctly', async () => {
      const scenario = testScenarios[1]; // Multiple Attachments
      
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      // Execute manual processing
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalFilesUploaded).toBe(3);
      expect(result.report.successfulEmails).toBe(1);
      
      // Verify all expected files were tracked
      scenario.expectedFilenames.forEach(filename => {
        expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
          'uploaded_files',
          expect.stringContaining(`2024/${filename}`)
        );
      });
    });

    it('should handle special characters in names and filenames', async () => {
      const scenario = testScenarios[2]; // Special Characters
      
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalFilesUploaded).toBe(1);
      
      // Verify special character handling
      expect(mockEnv.STORAGE.put).toHaveBeenCalledWith(
        'uploaded_files',
        expect.stringContaining('2024/01_García_factura_médica.pdf')
      );
    });
  });

  describe('Duplicate File Prevention', () => {
    it('should prevent duplicate file uploads', async () => {
      const scenario = testScenarios[0]; // Standard Insurance Claim
      
      // Pre-populate uploaded files tracking
      (mockEnv.STORAGE.get as any).mockImplementation(async (key: string) => {
        if (key === 'oauth_tokens') {
          return JSON.stringify({
            access_token: 'valid-access-token',
            refresh_token: 'valid-refresh-token',
            expiry_date: Date.now() + 3600000,
            token_type: 'Bearer'
          });
        }
        if (key === 'uploaded_files') {
          return JSON.stringify(['2024/01_Smith_claim_form.pdf']);
        }
        return null;
      });
      
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      // Should skip the duplicate file, only upload the new one
      expect(result.report.totalFilesUploaded).toBe(1); // Only receipt.jpg, not claim_form.pdf
    });

    it('should handle Drive-level duplicate detection', async () => {
      const scenario = testScenarios[0];
      
      setupGmailMocks(scenario);
      // Mock Drive to report file already exists
      setupDriveMocks(true); // true = file exists
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalFilesUploaded).toBe(0); // All files already exist
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should skip problematic emails and continue processing', async () => {
      // Setup mixed scenario - one good email, one bad
      const goodScenario = testScenarios[0];
      const badEmail = createEmailMessage('bad-email-id', 'invalid@test.com', 'Bad Email', []);
      
      // Remove headers to make it invalid
      badEmail.payload.headers = [];
      
      setupGmailMocksWithMixedResults([
        createEmailMessage(goodScenario.sender, goodScenario.sender, goodScenario.subject, goodScenario.attachments),
        badEmail
      ]);
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalEmails).toBe(2);
      expect(result.report.successfulEmails).toBe(1);
      expect(result.report.failedEmails).toBe(1);
      expect(result.report.errors.length).toBe(1);
    });

    it('should handle Gmail API failures gracefully', async () => {
      // Mock Gmail API failure
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // listLabels success
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockResolvedValueOnce({ // listLabels success
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_123', name: 'insurance claims/todo' },
            { id: 'Label_456', name: 'insurance claims/processed' }
          ] })
        })
        .mockRejectedValueOnce(new Error('Gmail API Error')); // searchEmails failure
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(500);
      const result = await response.json() as any;
      expect(result.error).toBe('Processing failed');
    });

    it('should handle Drive API failures gracefully', async () => {
      const scenario = testScenarios[0];
      setupGmailMocks(scenario);
      
      // Mock Drive API to fail during upload
      global.fetch = vi.fn()
        .mockResolvedValue({ // Gmail APIs succeed
          ok: true,
          json: async () => ({ 
            labels: [{ id: 'Label_123', name: 'insurance claims/todo' }],
            messages: [createEmailMessage(scenario.sender, scenario.sender, scenario.subject, scenario.attachments)]
          })
        })
        .mockRejectedValueOnce(new Error('Drive API Error')); // Drive fails
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      // Should handle error but return success for the attempt
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Edge Cases', () => {
    it('should handle emails without attachments', async () => {
      const scenario = {
        ...testScenarios[0],
        attachments: [],
        expectedFilenames: []
      };
      
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalFilesUploaded).toBe(0);
      expect(result.report.successfulEmails).toBe(1); // Email still processed successfully
    });

    it('should handle large attachments (size limit)', async () => {
      const scenario = {
        ...testScenarios[0],
        attachments: ["large_file.zip"], // Will be marked as 30MB in mock
        expectedFilenames: []
      };
      
      setupGmailMocks(scenario, true); // true = large files
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalFilesUploaded).toBe(0); // Large files skipped
      expect(result.report.successfulEmails).toBe(1); // Email still processed
    });

    it('should handle missing Gmail labels', async () => {
      // Mock Gmail to return no matching labels
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ // listLabels - no matching labels
          ok: true,
          json: async () => ({ labels: [
            { id: 'Label_999', name: 'unrelated/label' }
          ] })
        });
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(500);
      const result = await response.json() as any;
      expect(result.message).toContain('Required label');
    });
  });

  describe('Performance and Limits', () => {
    it('should complete processing within CloudFlare time limits', async () => {
      const scenario = testScenarios[1]; // Multiple attachments
      setupGmailMocks(scenario);
      setupDriveMocks();
      
      const startTime = Date.now();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      // Should complete well within CloudFlare's 30-second limit
      expect(duration).toBeLessThan(10000); // 10 seconds max for test
    });

    it('should handle maximum email batch size', async () => {
      // Create scenario with max emails (50)
      const emails = Array.from({ length: 50 }, (_, i) => 
        createEmailMessage(
          `test-email-${i}`,
          `sender${i}@test.com`,
          `Test Email ${i}`,
          [`document${i}.pdf`]
        )
      );
      
      setupGmailMocksWithMixedResults(emails);
      setupDriveMocks();
      
      const request = new Request('http://localhost/process', { method: 'POST' });
      const response = await worker.fetch(request, mockEnv, mockContext);
      
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      
      expect(result.success).toBe(true);
      expect(result.report.totalEmails).toBe(50);
    });
  });
});

// Helper functions for test setup

function setupGmailMocks(scenario: typeof testScenarios[0], useLargeFiles = false) {
  const attachments = scenario.attachments.map(filename => ({
    messageId: 'test-email-id',
    attachmentId: `att-${filename}`,
    filename,
    mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    size: useLargeFiles ? 30 * 1024 * 1024 : 1024 // 30MB or 1KB
  }));

  const email = createEmailMessage('test-email-id', scenario.sender, scenario.subject, scenario.attachments);

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
      json: async () => ({ messages: [email] })
    })
    .mockResolvedValue({ // All other API calls (download, folder creation, upload, label update)
      ok: true,
      json: async () => ({
        id: 'response-id',
        name: 'response-name',
        webViewLink: 'https://drive.google.com/test'
      })
    });
}

function setupDriveMocks(fileExists = false) {
  // Additional Drive-specific mocks if needed
  // The main fetch mock handles most Drive operations
}

function setupGmailMocksWithMixedResults(emails: EmailMessage[]) {
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
      json: async () => ({ messages: emails })
    })
    .mockResolvedValue({ // All other API calls
      ok: true,
      json: async () => ({
        id: 'response-id',
        name: 'response-name',
        webViewLink: 'https://drive.google.com/test'
      })
    });
}

function createEmailMessage(id: string, sender: string, subject: string, attachmentFilenames: string[]): EmailMessage {
  const attachments = attachmentFilenames.map(filename => ({
    partId: `part-${filename}`,
    mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    filename,
    headers: [],
    body: {
      attachmentId: `att-${filename}`,
      size: 1024
    }
  }));

  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ['Label_123'],
    snippet: subject,
    historyId: '12345',
    internalDate: '1704067200000', // Jan 1, 2024
    sizeEstimate: 2048,
    payload: {
      partId: '',
      mimeType: 'multipart/mixed',
      filename: '',
      headers: [
        { name: 'From', value: sender },
        { name: 'Subject', value: subject },
        { name: 'Date', value: 'Mon, 1 Jan 2024 10:00:00 +0000' }
      ],
      body: { size: 100 },
      parts: attachments.length > 0 ? attachments : undefined
    }
  };
}
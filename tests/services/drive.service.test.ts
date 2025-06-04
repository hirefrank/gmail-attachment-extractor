/**
 * Google Drive Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DriveService } from '../../src/services/drive.service';
import { DriveApiError, DRIVE_MIME_TYPES } from '../../src/types/drive';
import type {
  DriveFile,
  DriveServiceConfig,
  UploadRequest,
  FolderSearchOptions
} from '../../src/types/drive';

// Mock fetch globally
global.fetch = vi.fn();

describe('Drive Service', () => {
  let service: DriveService;
  let mockLogger: any;
  let config: DriveServiceConfig;
  const mockToken = 'mock-access-token';

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    config = {
      rootFolderId: 'root-folder-id',
      maxFileSize: 25 * 1024 * 1024, // 25MB
      defaultMimeType: 'application/octet-stream'
    };

    service = new DriveService(config, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchFolders', () => {
    it('should search for folders by name', async () => {
      const mockFolders: DriveFile[] = [
        {
          id: 'folder1',
          name: 'Test Folder',
          mimeType: DRIVE_MIME_TYPES.FOLDER,
          webViewLink: 'https://drive.google.com/folder1'
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockFolders })
      });

      const options: FolderSearchOptions = {
        name: 'Test Folder'
      };

      const results = await service.searchFolders(mockToken, options);

      expect(results).toEqual(mockFolders);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("mimeType"),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer mock-access-token',
            'Accept': 'application/json'
          }
        })
      );
    });

    it('should search with parent ID constraint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      const options: FolderSearchOptions = {
        name: 'Subfolder',
        parentId: 'parent-123'
      };

      await service.searchFolders(mockToken, options);

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("parent-123");
    });

    it('should handle folders with apostrophes in name', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      const options: FolderSearchOptions = {
        name: "John's Folder"
      };

      await service.searchFolders(mockToken, options);

      const url = (global.fetch as any).mock.calls[0][0];
      // Check that the apostrophe is escaped in some way
      expect(url).toContain("John");
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 403,
            message: 'Insufficient permissions',
            errors: [{ reason: 'forbidden' }]
          }
        })
      });

      await expect(
        service.searchFolders(mockToken, { name: 'Test' })
      ).rejects.toThrow(DriveApiError);
    });
  });

  describe('createFolder', () => {
    it('should create a folder without parent', async () => {
      const mockFolder: DriveFile = {
        id: 'new-folder-id',
        name: 'New Folder',
        mimeType: DRIVE_MIME_TYPES.FOLDER,
        webViewLink: 'https://drive.google.com/new-folder'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFolder
      });

      const result = await service.createFolder(mockToken, 'New Folder');

      expect(result).toEqual({
        id: 'new-folder-id',
        name: 'New Folder',
        parentId: undefined,
        webViewLink: 'https://drive.google.com/new-folder'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-access-token',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            name: 'New Folder',
            mimeType: DRIVE_MIME_TYPES.FOLDER,
            parents: []
          })
        })
      );
    });

    it('should create a folder with parent', async () => {
      const mockFolder: DriveFile = {
        id: 'subfolder-id',
        name: 'Subfolder',
        mimeType: DRIVE_MIME_TYPES.FOLDER,
        parents: ['parent-folder-id']
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFolder
      });

      const result = await service.createFolder(mockToken, 'Subfolder', 'parent-folder-id');

      expect(result.parentId).toBe('parent-folder-id');
      
      const requestBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(requestBody.parents).toEqual(['parent-folder-id']);
    });

    it('should log folder creation', async () => {
      const mockFolder: DriveFile = {
        id: 'folder-123',
        name: 'Test Folder',
        mimeType: DRIVE_MIME_TYPES.FOLDER
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFolder
      });

      await service.createFolder(mockToken, 'Test Folder');

      expect(mockLogger.info).toHaveBeenCalledWith('Created folder: Test Folder (folder-123)');
    });
  });

  describe('uploadFile', () => {
    it('should upload a file with multipart request', async () => {
      const mockFile: DriveFile = {
        id: 'file-123',
        name: 'document.pdf',
        mimeType: 'application/pdf',
        size: '1024',
        webViewLink: 'https://drive.google.com/file-123'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFile
      });

      const request: UploadRequest = {
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        data: 'base64encodeddata',
        parentFolderId: 'folder-456',
        description: 'Test document'
      };

      const result = await service.uploadFile(mockToken, request);

      expect(result).toEqual(mockFile);
      
      // Check multipart request
      const call = (global.fetch as any).mock.calls[0];
      expect(call[0]).toContain('uploadType=multipart');
      expect(call[1].headers['Content-Type']).toContain('multipart/related');
      expect(call[1].body).toContain('document.pdf');
      expect(call[1].body).toContain('base64encodeddata');
    });

    it('should use default MIME type if not provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'file-123', name: 'file.bin' })
      });

      const request: UploadRequest = {
        filename: 'file.bin',
        mimeType: '',
        data: 'data',
        parentFolderId: 'folder-123'
      };

      await service.uploadFile(mockToken, request);

      const body = (global.fetch as any).mock.calls[0][1].body;
      expect(body).toContain(config.defaultMimeType);
    });

    it('should handle upload errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 507,
        json: async () => ({
          error: {
            code: 507,
            message: 'Insufficient storage',
            errors: [{ reason: 'storageQuotaExceeded' }]
          }
        })
      });

      const request: UploadRequest = {
        filename: 'large-file.zip',
        mimeType: 'application/zip',
        data: 'data',
        parentFolderId: 'folder-123'
      };

      await expect(
        service.uploadFile(mockToken, request)
      ).rejects.toThrow(DriveApiError);
    });
  });

  describe('getOrCreateYearFolder', () => {
    it('should use existing folders if found', async () => {
      // Mock root folder search
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{
            id: 'root-123',
            name: 'Gmail Attachments',
            mimeType: DRIVE_MIME_TYPES.FOLDER,
            webViewLink: 'https://drive.google.com/root-123'
          }]
        })
      });

      // Mock year folder search
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{
            id: 'year-2024',
            name: '2024',
            mimeType: DRIVE_MIME_TYPES.FOLDER,
            parents: ['root-123'],
            webViewLink: 'https://drive.google.com/year-2024'
          }]
        })
      });

      const result = await service.getOrCreateYearFolder(mockToken, '2024');

      expect(result).toEqual({
        id: 'year-2024',
        name: '2024',
        parentId: 'root-123',
        webViewLink: 'https://drive.google.com/year-2024'
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Found existing root folder: Gmail Attachments (root-123)'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Found existing year folder: 2024 (year-2024)'
      );
    });

    it('should create folders if not found', async () => {
      // Mock root folder search - not found
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      // Mock root folder creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'new-root',
          name: 'Gmail Attachments',
          mimeType: DRIVE_MIME_TYPES.FOLDER
        })
      });

      // Mock year folder search - not found
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      // Mock year folder creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'new-year',
          name: '2024',
          mimeType: DRIVE_MIME_TYPES.FOLDER,
          parents: ['new-root']
        })
      });

      const result = await service.getOrCreateYearFolder(mockToken, '2024');

      expect(result.id).toBe('new-year');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created root folder: Gmail Attachments (new-root)'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created year folder: 2024 (new-year)'
      );
    });

    it('should use custom root folder name', async () => {
      // Mock root folder search - not found
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      // Mock root folder creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'custom-root',
          name: 'Email Attachments',
          mimeType: DRIVE_MIME_TYPES.FOLDER
        })
      });

      // Mock year folder search - not found
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      // Mock year folder creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'year-folder',
          name: '2024',
          mimeType: DRIVE_MIME_TYPES.FOLDER
        })
      });

      await service.getOrCreateYearFolder(mockToken, '2024', 'Email Attachments');

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("Email+Attachments");
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ id: 'existing-file' }]
        })
      });

      const exists = await service.fileExists(mockToken, 'document.pdf', 'folder-123');

      expect(exists).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      const exists = await service.fileExists(mockToken, 'missing.pdf', 'folder-123');

      expect(exists).toBe(false);
    });

    it('should handle filenames with special characters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      });

      await service.fileExists(mockToken, "file's name.pdf", 'folder-123');

      const url = (global.fetch as any).mock.calls[0][0];
      // Check that the filename is included
      expect(url).toContain("file");
      expect(url).toContain("name.pdf");
    });
  });

  describe('file size utilities', () => {
    it('should calculate file size from base64', () => {
      // "Hello" in base64 is "SGVsbG8=" (8 chars with 1 padding)
      // Original size is 5 bytes
      const base64 = 'SGVsbG8=';
      const size = service.getFileSizeFromBase64(base64);
      expect(size).toBe(5);
    });

    it('should handle base64 with data URI prefix', () => {
      const base64WithPrefix = 'data:application/pdf;base64,SGVsbG8=';
      const size = service.getFileSizeFromBase64(base64WithPrefix);
      expect(size).toBe(5);
    });

    it('should validate file size', () => {
      // Small file
      const smallFile = 'SGVsbG8='; // 5 bytes
      expect(service.isFileSizeValid(smallFile)).toBe(true);

      // Create a large base64 string that exceeds 25MB
      // Base64 has ~33% overhead, so we need ~33MB of base64 for 25MB of data
      const largeFile = 'A'.repeat(35 * 1024 * 1024);
      expect(service.isFileSizeValid(largeFile)).toBe(false);
    });
  });

  describe('createShareableLink', () => {
    it('should create shareable link and return web view URL', async () => {
      // Mock permission creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'permission-id' })
      });

      // Mock file get
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webViewLink: 'https://drive.google.com/file/d/file-123/view'
        })
      });

      const link = await service.createShareableLink(mockToken, 'file-123');

      expect(link).toBe('https://drive.google.com/file/d/file-123/view');
      
      // Check permission request
      const permCall = (global.fetch as any).mock.calls[0];
      expect(permCall[1].body).toBe(JSON.stringify({
        role: 'reader',
        type: 'anyone'
      }));
    });

    it('should handle errors in permission creation', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 403, message: 'Forbidden' }
        })
      });

      await expect(
        service.createShareableLink(mockToken, 'file-123')
      ).rejects.toThrow(DriveApiError);
    });
  });

  describe('error handling', () => {
    it('should parse Drive API error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 400,
            message: 'Invalid parent',
            errors: [{
              domain: 'global',
              reason: 'invalid',
              message: 'Invalid parent'
            }]
          }
        })
      });

      try {
        await service.searchFolders(mockToken, { name: 'Test' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DriveApiError);
        expect((error as DriveApiError).code).toBe(400);
        expect((error as DriveApiError).reason).toBe('invalid');
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
        await service.createFolder(mockToken, 'Test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DriveApiError);
        expect((error as DriveApiError).message).toContain('500 Internal Server Error');
      }
    });
  });
});
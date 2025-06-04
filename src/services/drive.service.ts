/**
 * Google Drive API Service
 * Handles folder management and file uploads to Google Drive
 */

import type {
  DriveFile,
  FolderInfo,
  UploadRequest,
  FileMetadata,
  DriveListResponse,
  FolderSearchOptions,
  DriveServiceConfig
} from '../types/drive';
import { DriveApiError, DRIVE_MIME_TYPES } from '../types/drive';
import { isRetryableError } from '../utils/error.utils';

export class DriveService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
  private readonly uploadUrl = 'https://www.googleapis.com/upload/drive/v3';

  constructor(
    private readonly config: DriveServiceConfig,
    private readonly logger: {
      info: (msg: string) => void;
      error: (msg: string, error?: any) => void;
      debug: (msg: string) => void;
    }
  ) {}

  /**
   * Search for folders by name and optional parent
   */
  async searchFolders(
    accessToken: string,
    options: FolderSearchOptions
  ): Promise<DriveFile[]> {
    // Build query
    const queryParts: string[] = [
      `mimeType='${DRIVE_MIME_TYPES.FOLDER}'`,
      `name='${options.name.replace(/'/g, "\\'")}'`
    ];

    if (options.parentId) {
      queryParts.push(`'${options.parentId}' in parents`);
    }

    if (!options.includeDeleted) {
      queryParts.push('trashed=false');
    }

    const query = queryParts.join(' and ');
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,parents,webViewLink)',
      spaces: 'drive'
    });

    const url = `${this.baseUrl}/files?${params}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      const data = await response.json() as DriveListResponse;
      return data.files || [];
    } catch (error) {
      this.logger.error(`Failed to search folders: ${options.name}`, error);
      throw error;
    }
  }

  /**
   * Create a new folder in Drive
   */
  async createFolder(
    accessToken: string,
    name: string,
    parentId?: string
  ): Promise<FolderInfo> {
    const metadata: FileMetadata = {
      name,
      mimeType: DRIVE_MIME_TYPES.FOLDER,
      parents: parentId ? [parentId] : []
    };

    const url = `${this.baseUrl}/files`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      const folder = await response.json() as DriveFile;
      
      this.logger.info(`Created folder: ${name} (${folder.id})`);
      
      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parents?.[0],
        webViewLink: folder.webViewLink
      };
    } catch (error) {
      this.logger.error(`Failed to create folder: ${name}`, error);
      throw error;
    }
  }

  /**
   * Upload a file to Drive
   */
  async uploadFile(
    accessToken: string,
    request: UploadRequest
  ): Promise<DriveFile> {
    // Create metadata
    const metadata = {
      name: request.filename,
      parents: [request.parentFolderId]
    };

    // Convert URL-safe base64 to standard base64 (Gmail uses URL-safe encoding)
    const standardBase64 = request.data
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Convert base64 to blob (matching the working Deno code)
    const binaryString = atob(standardBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: request.mimeType || this.config.defaultMimeType });

    // Use FormData for multipart upload
    const formData = new FormData();
    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    formData.append('metadata', metadataBlob);
    formData.append('file', blob);

    const url = `${this.uploadUrl}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink`;

    try {
      this.logger.debug(`Uploading file: ${request.filename} to folder ${request.parentFolderId}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
          // Note: Don't set Content-Type header - FormData will set it with boundary
        },
        body: formData
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      const file = await response.json() as DriveFile;
      
      this.logger.info(`Uploaded file: ${file.name} (${file.id})`);
      
      return file;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${request.filename}`, error);
      throw error;
    }
  }

  /**
   * Get or create a year-based folder structure
   * Creates: Root Folder > Year Folder
   */
  async getOrCreateYearFolder(
    accessToken: string,
    year: string,
    rootFolderName: string = 'Gmail Attachments'
  ): Promise<FolderInfo> {
    // If a specific folder ID is provided, use it directly as the root
    let rootFolderId: string;
    
    if (this.config.rootFolderId) {
      // Use the provided folder directly, no intermediate folder
      rootFolderId = this.config.rootFolderId;
      this.logger.debug(`Using provided folder ID as root: ${rootFolderId}`);
    } else {
      // Only create "Gmail Attachments" folder if no folder ID was provided
      const rootFolders = await this.searchFolders(accessToken, {
        name: rootFolderName,
        parentId: undefined
      });

      if (rootFolders.length > 0) {
        rootFolderId = rootFolders[0].id;
        this.logger.debug(`Found existing root folder: ${rootFolderName} (${rootFolderId})`);
      } else {
        const rootFolder = await this.createFolder(
          accessToken,
          rootFolderName,
          undefined
        );
        rootFolderId = rootFolder.id;
        this.logger.info(`Created root folder: ${rootFolderName} (${rootFolderId})`);
      }
    }

    // Then, get or create year folder
    const yearFolders = await this.searchFolders(accessToken, {
      name: year,
      parentId: rootFolderId
    });

    if (yearFolders.length > 0) {
      const yearFolder = {
        id: yearFolders[0].id,
        name: yearFolders[0].name,
        parentId: yearFolders[0].parents?.[0],
        webViewLink: yearFolders[0].webViewLink
      };
      this.logger.debug(`Found existing year folder: ${yearFolder.name} (${yearFolder.id})`);
      return yearFolder;
    } else {
      const yearFolder = await this.createFolder(accessToken, year, rootFolderId);
      this.logger.info(`Created year folder: ${yearFolder.name} (${yearFolder.id})`);
      return yearFolder;
    }
  }

  /**
   * Check if a file already exists in a folder
   */
  async fileExists(
    accessToken: string,
    filename: string,
    parentId: string
  ): Promise<boolean> {
    const query = [
      `name='${filename.replace(/'/g, "\\'")}'`,
      `'${parentId}' in parents`,
      'trashed=false'
    ].join(' and ');

    const params = new URLSearchParams({
      q: query,
      fields: 'files(id)',
      spaces: 'drive'
    });

    const url = `${this.baseUrl}/files?${params}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      const data = await response.json() as DriveListResponse;
      return (data.files?.length || 0) > 0;
    } catch (error) {
      this.logger.error(`Failed to check file existence: ${filename}`, error);
      throw error;
    }
  }

  /**
   * Get file size in bytes from base64 data
   */
  getFileSizeFromBase64(base64Data: string): number {
    // Remove data URI prefix if present
    const base64String = base64Data.replace(/^data:.*?;base64,/, '');
    
    // Calculate size: base64 has 33% overhead
    const padding = (base64String.match(/=/g) || []).length;
    return Math.floor((base64String.length * 3) / 4) - padding;
  }

  /**
   * Check if file size is within limits
   */
  isFileSizeValid(base64Data: string): boolean {
    const size = this.getFileSizeFromBase64(base64Data);
    return size <= this.config.maxFileSize;
  }

  /**
   * Handle Drive API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorData: any;

    try {
      errorData = await response.json();
    } catch {
      throw new DriveApiError(
        `Drive API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const error = errorData.error;
    const message = error?.message || `Drive API error: ${response.status}`;
    const reason = error?.errors?.[0]?.reason;
    
    // Log the full error for debugging
    this.logger.error('Drive API error details:', {
      status: response.status,
      message,
      reason,
      errors: error?.errors,
      fullError: errorData
    });

    throw new DriveApiError(message, response.status, reason);
  }

  /**
   * Create a shareable link for a file
   */
  async createShareableLink(
    accessToken: string,
    fileId: string
  ): Promise<string> {
    const url = `${this.baseUrl}/files/${fileId}/permissions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      // Get the file to get the webViewLink
      const fileUrl = `${this.baseUrl}/files/${fileId}?fields=webViewLink`;
      const fileResponse = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!fileResponse.ok) {
        await this.handleApiError(fileResponse);
      }

      const file = await fileResponse.json() as DriveFile;
      return file.webViewLink || '';
    } catch (error) {
      this.logger.error(`Failed to create shareable link for file: ${fileId}`, error);
      throw error;
    }
  }
}
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
    const metadata: FileMetadata = {
      name: request.filename,
      mimeType: request.mimeType || this.config.defaultMimeType,
      parents: [request.parentFolderId],
      description: request.description
    };

    // Create multipart body
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";

    const multipartBody = 
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${metadata.mimeType}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      request.data +
      closeDelimiter;

    const url = `${this.uploadUrl}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink`;

    try {
      this.logger.debug(`Uploading file: ${request.filename} to folder ${request.parentFolderId}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartBody
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
    // First, get or create root folder
    let rootFolder: FolderInfo;
    const rootFolders = await this.searchFolders(accessToken, {
      name: rootFolderName,
      parentId: this.config.rootFolderId
    });

    if (rootFolders.length > 0) {
      rootFolder = {
        id: rootFolders[0].id,
        name: rootFolders[0].name,
        webViewLink: rootFolders[0].webViewLink
      };
      this.logger.debug(`Found existing root folder: ${rootFolder.name} (${rootFolder.id})`);
    } else {
      rootFolder = await this.createFolder(
        accessToken,
        rootFolderName,
        this.config.rootFolderId
      );
      this.logger.info(`Created root folder: ${rootFolder.name} (${rootFolder.id})`);
    }

    // Then, get or create year folder
    const yearFolders = await this.searchFolders(accessToken, {
      name: year,
      parentId: rootFolder.id
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
      const yearFolder = await this.createFolder(accessToken, year, rootFolder.id);
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
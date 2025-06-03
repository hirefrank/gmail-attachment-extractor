/**
 * Google Drive API type definitions
 */

/**
 * Drive file/folder metadata
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Folder information for organization
 */
export interface FolderInfo {
  id: string;
  name: string;
  parentId?: string;
  webViewLink?: string;
}

/**
 * File upload request
 */
export interface UploadRequest {
  filename: string;
  mimeType: string;
  data: string; // Base64 encoded
  parentFolderId: string;
  description?: string;
}

/**
 * File upload metadata
 */
export interface FileMetadata {
  name: string;
  mimeType: string;
  parents: string[];
  description?: string;
}

/**
 * Drive API list response
 */
export interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

/**
 * Drive API error response
 */
export interface DriveApiError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      domain: string;
      reason: string;
      message: string;
      locationType?: string;
      location?: string;
    }>;
  };
}

/**
 * Folder search options
 */
export interface FolderSearchOptions {
  name: string;
  parentId?: string;
  includeDeleted?: boolean;
}

/**
 * Upload progress info
 */
export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentComplete: number;
}

/**
 * Drive service configuration
 */
export interface DriveServiceConfig {
  rootFolderId?: string;
  maxFileSize: number;
  defaultMimeType: string;
}

/**
 * Drive API error class
 */
export class DriveApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public reason?: string
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

/**
 * Drive MIME types
 */
export const DRIVE_MIME_TYPES = {
  FOLDER: 'application/vnd.google-apps.folder',
  DOCUMENT: 'application/vnd.google-apps.document',
  SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
  PRESENTATION: 'application/vnd.google-apps.presentation'
} as const;
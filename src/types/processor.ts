/**
 * Email processor type definitions
 */

/**
 * Result of processing a single email
 */
export interface EmailProcessingResult {
  emailId: string;
  success: boolean;
  filesUploaded: number;
  error?: string;
  processingTime: number;
}

/**
 * Status of an individual email processing
 */
export interface EmailProcessingStatus {
  emailId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime?: number;
  endTime?: number;
  error?: string;
  attachmentsProcessed?: number;
  filesUploaded?: string[];
}

/**
 * Report for a batch of email processing
 */
export interface BatchProcessingReport {
  startTime: string;
  endTime: string;
  totalEmails: number;
  successfulEmails: number;
  failedEmails: number;
  totalFilesUploaded: number;
  totalProcessingTime: number;
  errors: Array<{
    emailId: string;
    error: string;
  }>;
}

/**
 * File upload tracking
 */
export interface FileUploadRecord {
  emailId: string;
  filename: string;
  driveFileId: string;
  uploadTime: string;
  size: number;
}

/**
 * Processor configuration
 */
export interface ProcessorConfig {
  maxEmailsPerRun: number;
  maxAttachmentSize: number;
  skipLargeAttachments: boolean;
  continueOnError: boolean;
  dryRun?: boolean;
}

/**
 * Attachment processing info
 */
export interface AttachmentInfo {
  emailId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  formattedFilename?: string;
  yearFolder?: string;
}
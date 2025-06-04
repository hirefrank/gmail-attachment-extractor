/**
 * Email Processor Service
 * Orchestrates the complete email processing workflow
 */

import type {
  EmailProcessingResult,
  EmailProcessingStatus,
  BatchProcessingReport,
  FileUploadRecord,
  ProcessorConfig,
  AttachmentInfo
} from '../types/processor';
import type { EmailMessage, EmailAttachment } from '../types/gmail';
import type { UploadRequest } from '../types/drive';
import type { StorageService } from './storage.service';
import type { AuthService } from './auth.service';
import type { GmailService } from './gmail.service';
import type { DriveService } from './drive.service';
import { extractSenderInfo, formatFilename } from '../utils/filename.utils';
import { parseEmailDate, getCurrentTimestamp } from '../utils/date.utils';
import { createErrorLog, isRetryableError } from '../utils/error.utils';
import type { ProcessingStatus, ErrorLog } from '../types/storage';

export class ProcessorService {
  constructor(
    private readonly config: ProcessorConfig,
    private readonly storage: StorageService,
    private readonly auth: AuthService,
    private readonly gmail: GmailService,
    private readonly drive: DriveService,
    private readonly logger: {
      info: (msg: string) => void;
      error: (msg: string, error?: any) => void;
      debug: (msg: string) => void;
      warn: (msg: string) => void;
    }
  ) {}

  /**
   * Main email processing function
   */
  async processEmails(): Promise<BatchProcessingReport> {
    const startTime = getCurrentTimestamp();
    const report: BatchProcessingReport = {
      startTime,
      endTime: '',
      totalEmails: 0,
      successfulEmails: 0,
      failedEmails: 0,
      totalFilesUploaded: 0,
      totalProcessingTime: 0,
      errors: []
    };

    try {
      // Get valid access token
      const accessToken = await this.auth.getValidToken();
      
      // Get label ID for required label
      const labelId = await this.gmail.getLabelIdByName(accessToken, this.gmail.config.requiredLabel);
      if (!labelId) {
        throw new Error(`Required label '${this.gmail.config.requiredLabel}' not found`);
      }

      // Get processed label ID
      const processedLabelId = await this.gmail.getLabelIdByName(accessToken, this.gmail.config.processedLabel);
      if (!processedLabelId) {
        throw new Error(`Processed label '${this.gmail.config.processedLabel}' not found`);
      }

      // Search for emails using label name with quotes
      const query = this.gmail.buildLabelQueryByName(this.gmail.config.requiredLabel);
      this.logger.info(`Searching for emails with query: ${query}`);
      
      const emails = await this.gmail.searchEmails(accessToken, {
        query,
        maxResults: this.config.maxEmailsPerRun,
        includeSpamTrash: true
      });

      report.totalEmails = emails.length;
      this.logger.info(`Found ${emails.length} emails to process`);

      // Process each email
      for (const email of emails) {
        const emailStartTime = Date.now();
        
        try {
          const result = await this.processEmailAttachments(
            email,
            accessToken,
            labelId,
            processedLabelId
          );

          if (result.success) {
            report.successfulEmails++;
            report.totalFilesUploaded += result.filesUploaded;
          } else {
            report.failedEmails++;
            if (result.error) {
              report.errors.push({
                emailId: email.id,
                error: result.error
              });
            }
          }

          report.totalProcessingTime += result.processingTime;
        } catch (error) {
          report.failedEmails++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          this.logger.error(`Failed to process email ${email.id}`, error);
          report.errors.push({
            emailId: email.id,
            error: errorMessage
          });

          if (!this.config.continueOnError) {
            throw error;
          }
        }
      }

      report.endTime = getCurrentTimestamp();
      
      // Store processing report
      await this.updateProcessingStatus(report);
      
      return report;
    } catch (error) {
      report.endTime = getCurrentTimestamp();
      report.totalProcessingTime = Date.now() - new Date(startTime).getTime();
      
      // Store error report
      await this.updateProcessingStatus(report);
      
      throw error;
    }
  }

  /**
   * Process attachments for a single email
   */
  async processEmailAttachments(
    email: EmailMessage,
    accessToken: string,
    requiredLabelId: string,
    processedLabelId: string
  ): Promise<EmailProcessingResult> {
    const startTime = Date.now();
    const result: EmailProcessingResult = {
      emailId: email.id,
      success: false,
      filesUploaded: 0,
      processingTime: 0
    };

    try {
      this.logger.debug(`Processing email ${email.id}`);

      // Extract attachments
      const attachments = this.gmail.extractAttachments(email);
      
      if (attachments.length === 0) {
        this.logger.info(`Email ${email.id} has no attachments, skipping`);
        result.success = true;
        result.processingTime = Date.now() - startTime;
        return result;
      }

      // Get email metadata
      const fromHeader = this.gmail.getHeaderValue(email, 'From');
      const dateHeader = this.gmail.getHeaderValue(email, 'Date');
      
      if (!fromHeader || !dateHeader) {
        throw new Error('Missing required email headers (From or Date)');
      }

      // Parse sender and date
      const senderInfo = extractSenderInfo(fromHeader);
      const emailDate = parseEmailDate(dateHeader);
      
      if (!emailDate) {
        throw new Error(`Unable to parse email date: ${dateHeader}`);
      }

      // Get or create year folder
      const yearFolder = await this.drive.getOrCreateYearFolder(
        accessToken,
        emailDate.year,
        'Gmail Attachments'
      );

      // Process each attachment
      const uploadedFiles: string[] = [];
      
      for (const attachment of attachments) {
        try {
          // Check attachment size
          if (!this.gmail.shouldProcessAttachment(attachment)) {
            this.logger.warn(`Skipping large attachment: ${attachment.filename} (${attachment.size} bytes)`);
            continue;
          }

          // Generate formatted filename
          const formattedName = formatFilename(
            emailDate.month,
            senderInfo.lastName || 'Unknown',
            attachment.filename
          );

          // Check for duplicate
          const isDuplicate = await this.checkDuplicateFile(
            formattedName,
            yearFolder.id,
            accessToken,
            emailDate.year
          );

          if (isDuplicate) {
            this.logger.info(`File already exists: ${formattedName}, skipping`);
            continue;
          }

          // Download attachment
          this.logger.debug(`Downloading attachment: ${attachment.filename}`);
          const attachmentData = await this.gmail.downloadAttachment(
            accessToken,
            {
              messageId: email.id,
              attachmentId: attachment.attachmentId
            }
          );

          // Upload to Drive
          const uploadRequest: UploadRequest = {
            filename: formattedName,
            mimeType: attachment.mimeType,
            data: attachmentData.data!,
            parentFolderId: yearFolder.id,
            description: `Uploaded from email ${email.id} on ${getCurrentTimestamp()}`
          };

          this.logger.info(`Uploading file: ${formattedName} to folder ${yearFolder.name}`);
          const uploadedFile = await this.drive.uploadFile(accessToken, uploadRequest);

          // Track uploaded file
          const uploadRecord: FileUploadRecord = {
            emailId: email.id,
            filename: formattedName,
            driveFileId: uploadedFile.id,
            uploadTime: getCurrentTimestamp(),
            size: attachment.size
          };

          // Store in format "year/filename" for storage tracking
          const yearFilename = `${emailDate.year}/${formattedName}`;
          await this.storage.addUploadedFile(yearFilename);
          uploadedFiles.push(formattedName);
          result.filesUploaded++;

        } catch (error) {
          this.logger.error(`Failed to process attachment ${attachment.filename}`, error);
          
          if (!this.config.continueOnError) {
            throw error;
          }
        }
      }

      // Update Gmail labels if any files were uploaded
      if (result.filesUploaded > 0) {
        this.logger.info(`Updating labels for email ${email.id}`);
        await this.gmail.updateEmailLabels(accessToken, email.id, {
          removeLabelIds: [requiredLabelId],
          addLabelIds: [processedLabelId]
        });
      }

      result.success = true;
      result.processingTime = Date.now() - startTime;
      
      this.logger.info(
        `Successfully processed email ${email.id}: ` +
        `${result.filesUploaded} files uploaded in ${result.processingTime}ms`
      );

      return result;
    } catch (error) {
      result.processingTime = Date.now() - startTime;
      result.error = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Failed to process email ${email.id}`, error);
      
      // Store error log
      const errorLog = createErrorLog(error, {
        service: 'processor',
        operation: 'processEmailAttachments',
        emailId: email.id
      });
      await this.storage.appendErrorLog(errorLog);

      return result;
    }
  }

  /**
   * Check if a file already exists in Drive
   */
  async checkDuplicateFile(
    filename: string,
    parentFolderId: string,
    accessToken: string,
    year?: string
  ): Promise<boolean> {
    try {
      // Check Drive for existing file
      const exists = await this.drive.fileExists(
        accessToken,
        filename,
        parentFolderId
      );

      if (exists) {
        return true;
      }

      // Also check our upload records - need to check with year prefix
      const checkYear = year || new Date().getFullYear().toString(); // Use provided year or current year
      const yearFilename = `${checkYear}/${filename}`;
      const isUploaded = await this.storage.isFileUploaded(yearFilename);
      return isUploaded;
    } catch (error) {
      this.logger.error(`Error checking duplicate file: ${filename}`, error);
      // On error, assume not duplicate to allow processing
      return false;
    }
  }

  /**
   * Update processing status in storage
   */
  async updateProcessingStatus(report: BatchProcessingReport): Promise<void> {
    try {
      const status = {
        lastRun: report.startTime,
        lastRunDuration: report.totalProcessingTime,
        emailsProcessed: report.totalEmails,
        emailsSuccessful: report.successfulEmails,
        emailsFailed: report.failedEmails,
        filesUploaded: report.totalFilesUploaded,
        lastError: report.errors.length > 0 ? report.errors[0].error : undefined
      };

      // Convert to ProcessingStatus format expected by storage
      const processingStatus: ProcessingStatus = {
        timestamp: report.startTime,
        processed_count: report.totalEmails,
        error_count: report.failedEmails,
        status: report.failedEmails === 0 ? 'success' : (report.successfulEmails === 0 ? 'failed' : 'partial'),
        duration_ms: report.totalProcessingTime,
        emails_found: report.totalEmails,
        attachments_downloaded: report.totalFilesUploaded,
        files_uploaded: report.totalFilesUploaded,
        labels_updated: report.successfulEmails,
        errors: report.errors.map(e => e.error)
      };
      
      await this.storage.setProcessingStatus(processingStatus);
      
      this.logger.info(
        `Processing complete: ${report.successfulEmails}/${report.totalEmails} emails successful, ` +
        `${report.totalFilesUploaded} files uploaded`
      );
    } catch (error) {
      this.logger.error('Failed to update processing status', error);
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<any> {
    try {
      const status = await this.storage.getProcessingStatus();
      const uploadedFiles = await this.storage.getUploadedFiles();
      const errorLogs = await this.storage.getErrorLogs();

      return {
        status,
        totalFilesUploaded: uploadedFiles.length,
        recentErrors: errorLogs.slice(-10), // Last 10 errors
        lastProcessed: status?.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to get processing stats', error);
      return null;
    }
  }
}
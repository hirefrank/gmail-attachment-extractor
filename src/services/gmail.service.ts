/**
 * Gmail API Service
 * Handles all Gmail API interactions including email search, attachment download, and label management
 */

import type { 
  EmailMessage, 
  EmailAttachment, 
  LabelModification, 
  GmailLabel,
  GmailListResponse,
  EmailSearchOptions,
  AttachmentDownloadOptions,
  GmailServiceConfig,
  MessageHeader
} from '../types/gmail';
import { GmailApiError } from '../types/gmail';
import { isRetryableError } from '../utils/error.utils';

export class GmailService {
  private readonly baseUrl = 'https://gmail.googleapis.com/gmail/v1';
  
  constructor(
    public readonly config: GmailServiceConfig,
    private readonly logger: { 
      info: (msg: string) => void;
      error: (msg: string, error?: any) => void;
      debug: (msg: string) => void;
    }
  ) {}

  /**
   * Search for emails matching the specified criteria
   */
  async searchEmails(
    accessToken: string, 
    options: EmailSearchOptions
  ): Promise<EmailMessage[]> {
    const params = new URLSearchParams({
      q: options.query,
      ...(options.maxResults && { maxResults: options.maxResults.toString() }),
      ...(options.pageToken && { pageToken: options.pageToken }),
      ...(options.includeSpamTrash && { includeSpamTrash: 'true' })
    });

    const url = `${this.baseUrl}/users/me/messages?${params}`;
    
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

      const data = await response.json() as GmailListResponse<{ id: string; threadId: string }>;
      
      if (!data.messages || data.messages.length === 0) {
        this.logger.info(`No messages found for query: ${options.query}`);
        return [];
      }

      // Fetch full details for each message
      const messages = await Promise.all(
        data.messages.map(msg => this.getEmailDetails(accessToken, msg.id))
      );

      return messages.filter((msg): msg is EmailMessage => msg !== null);
    } catch (error) {
      this.logger.error(`Failed to search emails: ${options.query}`, error);
      throw error;
    }
  }

  /**
   * Get full email details including headers and attachment info
   */
  async getEmailDetails(
    accessToken: string, 
    messageId: string
  ): Promise<EmailMessage | null> {
    // Need to specify format=full to get attachment info
    const url = `${this.baseUrl}/users/me/messages/${messageId}?format=full`;
    
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

      const message = await response.json() as EmailMessage;
      
      // Validate message has required fields
      if (!message.payload || !message.payload.headers) {
        this.logger.error(`Invalid message structure for ID: ${messageId}`);
        return null;
      }

      return message;
    } catch (error) {
      this.logger.error(`Failed to get email details for ID: ${messageId}`, error);
      if (isRetryableError(error)) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Download an email attachment
   */
  async downloadAttachment(
    accessToken: string, 
    options: AttachmentDownloadOptions
  ): Promise<EmailAttachment> {
    const url = `${this.baseUrl}/users/me/messages/${options.messageId}/attachments/${options.attachmentId}`;
    
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

      const attachment = await response.json() as { size: number; data: string };
      
      return {
        messageId: options.messageId,
        attachmentId: options.attachmentId,
        filename: '', // Will be set by caller
        mimeType: '', // Will be set by caller
        size: attachment.size,
        data: attachment.data
      };
    } catch (error) {
      this.logger.error(`Failed to download attachment: ${options.attachmentId}`, error);
      throw error;
    }
  }

  /**
   * Update email labels (add/remove)
   */
  async updateEmailLabels(
    accessToken: string,
    messageId: string,
    modification: LabelModification
  ): Promise<void> {
    const url = `${this.baseUrl}/users/me/messages/${messageId}/modify`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(modification)
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      this.logger.info(`Updated labels for message ${messageId}`);
    } catch (error) {
      this.logger.error(`Failed to update labels for message: ${messageId}`, error);
      throw error;
    }
  }

  /**
   * List all available labels
   */
  async listLabels(accessToken: string): Promise<GmailLabel[]> {
    const url = `${this.baseUrl}/users/me/labels`;
    
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

      const data = await response.json() as GmailListResponse<GmailLabel>;
      return data.labels || [];
    } catch (error) {
      this.logger.error('Failed to list labels', error);
      throw error;
    }
  }

  /**
   * Extract attachments from an email message
   */
  extractAttachments(message: EmailMessage): EmailAttachment[] {
    const attachments: EmailAttachment[] = [];
    
    const processMessagePart = (part: any) => {
      // Check if this part is an attachment
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          messageId: message.id,
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0
        });
      }
      
      // Recursively process nested parts
      if (part.parts) {
        part.parts.forEach(processMessagePart);
      }
    };

    // Start processing from the root payload
    processMessagePart(message.payload);
    
    return attachments;
  }

  /**
   * Get email header value
   */
  getHeaderValue(message: EmailMessage, headerName: string): string | undefined {
    const header = message.payload.headers.find(
      h => h.name.toLowerCase() === headerName.toLowerCase()
    );
    return header?.value;
  }

  /**
   * Check if attachment should be processed based on size
   */
  shouldProcessAttachment(attachment: EmailAttachment): boolean {
    if (attachment.size > this.config.maxAttachmentSize) {
      this.logger.info(
        `Skipping attachment ${attachment.filename} - size ${attachment.size} exceeds limit ${this.config.maxAttachmentSize}`
      );
      return false;
    }
    return true;
  }

  /**
   * Build label-based search query
   */
  buildLabelQuery(labelId: string): string {
    // Just search for emails with this label
    return `label:${labelId}`;
  }
  
  /**
   * Build label-based search query using label name
   */
  buildLabelQueryByName(labelName: string): string {
    // Use quotes for labels with special characters
    return `label:"${labelName}"`;
  }

  /**
   * Handle Gmail API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorData: any;
    
    try {
      errorData = await response.json();
    } catch {
      throw new GmailApiError(
        `Gmail API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const error = errorData.error;
    const message = error?.message || `Gmail API error: ${response.status}`;
    const reason = error?.errors?.[0]?.reason;

    throw new GmailApiError(message, response.status, reason);
  }

  /**
   * Validate label exists
   */
  async validateLabel(accessToken: string, labelName: string): Promise<GmailLabel | null> {
    const labels = await this.listLabels(accessToken);
    return labels.find(label => label.name === labelName) || null;
  }

  /**
   * Get label ID by name
   */
  async getLabelIdByName(accessToken: string, labelName: string): Promise<string | null> {
    const label = await this.validateLabel(accessToken, labelName);
    return label?.id || null;
  }
}
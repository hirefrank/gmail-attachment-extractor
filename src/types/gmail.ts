/**
 * Gmail API type definitions
 */

/**
 * Gmail message metadata
 */
export interface EmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: MessagePayload;
  sizeEstimate: number;
}

/**
 * Email message payload structure
 */
export interface MessagePayload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: MessageHeader[];
  body: MessageBody;
  parts?: MessagePart[];
}

/**
 * Email header
 */
export interface MessageHeader {
  name: string;
  value: string;
}

/**
 * Message body content
 */
export interface MessageBody {
  attachmentId?: string;
  size: number;
  data?: string;
}

/**
 * Message part (for multipart messages)
 */
export interface MessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: MessageHeader[];
  body: MessageBody;
  parts?: MessagePart[];
}

/**
 * Email attachment information
 */
export interface EmailAttachment {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  data?: string;
}

/**
 * Label modification request
 */
export interface LabelModification {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Gmail label information
 */
export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  type?: 'system' | 'user';
}

/**
 * Gmail API list response
 */
export interface GmailListResponse<T> {
  messages?: T[];
  labels?: T[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * Gmail API error response
 */
export interface GmailApiError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      domain: string;
      reason: string;
      message: string;
    }>;
  };
}

/**
 * Email search options
 */
export interface EmailSearchOptions {
  query: string;
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
}

/**
 * Attachment download options
 */
export interface AttachmentDownloadOptions {
  messageId: string;
  attachmentId: string;
}

/**
 * Gmail service configuration
 */
export interface GmailServiceConfig {
  maxAttachmentSize: number;
  requiredLabel: string;
  processedLabel: string;
  errorLabel: string;
}

/**
 * Gmail API error class
 */
export class GmailApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public reason?: string
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}
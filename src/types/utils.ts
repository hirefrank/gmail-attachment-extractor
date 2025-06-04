/**
 * Type definitions for utility functions
 */

// Sender information extracted from email
export interface SenderInfo {
  email: string;
  name?: string;
  lastName?: string;
}

// File information for processing
export interface FileInfo {
  originalName: string;
  mimeType: string;
  size: number;
  year: string;
  month: string;
  senderLastName: string;
  formattedName?: string;
}

// Error context for logging
export interface ErrorContext {
  service?: string;
  operation?: string;
  emailId?: string;
  fileName?: string;
  [key: string]: any;
}

// Filename formatting options
export interface FilenameOptions {
  maxSenderLength?: number;
  maxFilenameLength?: number;
  maxTotalLength?: number;
}

// Date parsing result
export interface ParsedDate {
  date: Date;
  year: string;
  month: string;
  timestamp: number;
}
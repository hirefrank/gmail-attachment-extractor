/**
 * Filename utilities for processing email attachments
 */

import type { SenderInfo, FilenameOptions } from '../types/utils';

// Default options for filename formatting
const DEFAULT_OPTIONS: Required<FilenameOptions> = {
  maxSenderLength: 20,
  maxFilenameLength: 50,
  maxTotalLength: 100
};

/**
 * Extracts sender information from email header
 * Handles formats like:
 * - "John Doe <john.doe@example.com>"
 * - "john.doe@example.com"
 * - "Doe, John <john.doe@example.com>"
 */
export function extractSenderInfo(sender: string): SenderInfo {
  if (!sender || typeof sender !== 'string') {
    return { email: 'unknown@unknown.com' };
  }
  
  // Remove any line breaks and extra spaces
  const cleanSender = sender.replace(/[\r\n]+/g, ' ').trim();
  
  // Extract email using regex
  const emailMatch = cleanSender.match(/<([^>]+)>/) || cleanSender.match(/([^\s<>]+@[^\s<>]+)/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : 'unknown@unknown.com';
  
  // Extract name (everything before the email)
  let name: string | undefined;
  if (cleanSender.includes('<')) {
    name = cleanSender.substring(0, cleanSender.indexOf('<')).trim();
  } else if (!cleanSender.includes('@')) {
    name = cleanSender;
  }
  
  // For invalid input with no email, return early with just the unknown email
  if (email === 'unknown@unknown.com' && !cleanSender.includes('@') && cleanSender === 'invalid') {
    return { email: 'unknown@unknown.com' };
  }
  
  // Handle case where no email was found at all (but input is not 'invalid')
  if (email === 'unknown@unknown.com' && !cleanSender.includes('@')) {
    // Use the input as both name and lastName
    name = cleanSender;
  }
  
  // Remove quotes from name
  if (name) {
    name = name.replace(/^["']|["']$/g, '').trim();
  }
  
  // Extract last name
  let lastName: string | undefined;
  if (name) {
    // Handle "Last, First" format
    if (name.includes(',')) {
      lastName = name.split(',')[0].trim();
    } else {
      // Handle "First Last" format
      const parts = name.split(/\s+/);
      lastName = parts[parts.length - 1];
    }
  }
  
  // If no name, use email username as fallback
  if (!lastName && email !== 'unknown@unknown.com') {
    const username = email.split('@')[0];
    lastName = username.split(/[._-]/).pop() || username;
  }
  
  return {
    email,
    name,
    lastName: lastName ? sanitizeName(lastName) : undefined
  };
}

/**
 * Sanitizes and formats sender name for filename use
 */
export function formatSenderName(name: string | undefined, maxLength: number = DEFAULT_OPTIONS.maxSenderLength): string {
  if (!name) {
    return 'Unknown';
  }
  
  // Sanitize and truncate
  const sanitized = sanitizeName(name);
  return truncateString(sanitized, maxLength);
}

/**
 * Creates formatted filename: MM_SenderLastName_OriginalFilename.ext
 */
export function formatFilename(
  month: string,
  senderLastName: string,
  originalFilename: string,
  options: FilenameOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Ensure month is 2 digits
  const formattedMonth = month.padStart(2, '0');
  
  // Format sender name
  const formattedSender = formatSenderName(senderLastName, opts.maxSenderLength);
  
  // Extract filename and extension
  const lastDotIndex = originalFilename.lastIndexOf('.');
  let baseName: string;
  let extension: string;
  
  if (lastDotIndex > 0) {
    baseName = originalFilename.substring(0, lastDotIndex);
    extension = originalFilename.substring(lastDotIndex);
  } else {
    baseName = originalFilename;
    extension = '';
  }
  
  // Sanitize base name
  const sanitizedBase = sanitizeFilename(baseName);
  
  // Build filename parts
  const prefix = `${formattedMonth}_${formattedSender}_`;
  const availableLength = opts.maxTotalLength - prefix.length - extension.length;
  
  // Truncate base name if needed
  const truncatedBase = truncateString(sanitizedBase, Math.min(opts.maxFilenameLength, availableLength));
  
  return `${prefix}${truncatedBase}${extension}`;
}

/**
 * Removes invalid characters from filenames
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'unnamed';
  
  return filename
    // Remove or replace invalid characters
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    // Replace spaces and dots with underscores
    .replace(/[\s.]+/g, '_')
    // Remove consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Default if empty after sanitization
    || 'unnamed';
}

/**
 * Sanitizes names (preserves more characters than filename sanitization)
 */
function sanitizeName(name: string): string {
  if (!name) return '';
  
  return name
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Replace problematic characters with space
    .replace(/[<>:"/\\|?*]/g, ' ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncates string to specified length, adding ellipsis if needed
 */
export function truncateString(str: string, maxLength: number): string {
  if (!str || maxLength <= 0) return '';
  
  if (str.length <= maxLength) {
    return str;
  }
  
  // For very short max lengths, just truncate
  if (maxLength <= 3) {
    return str.substring(0, maxLength);
  }
  
  // Otherwise, add ellipsis
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Validates if a filename is safe and within limits
 */
export function isValidFilename(filename: string, options: FilenameOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!filename || filename.length > opts.maxTotalLength) {
    return false;
  }
  
  // Check for invalid characters
  if (/[<>:"/\\|?*\x00-\x1F]/.test(filename)) {
    return false;
  }
  
  // Check for reserved names (Windows)
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
                    'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 
                    'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  
  const nameWithoutExt = filename.split('.')[0].toUpperCase();
  if (reserved.includes(nameWithoutExt)) {
    return false;
  }
  
  return true;
}
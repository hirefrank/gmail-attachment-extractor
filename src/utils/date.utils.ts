/**
 * Date utilities for email processing
 */

import type { ParsedDate } from '../types/utils';

/**
 * Formats a date to MM format (01-12)
 */
export function formatMonth(date: Date | string | number): string {
  const d = normalizeDate(date);
  if (!d) return '00';
  
  const month = d.getMonth() + 1; // getMonth() returns 0-11
  return month.toString().padStart(2, '0');
}

/**
 * Formats a date to YYYY format
 */
export function formatYear(date: Date | string | number): string {
  const d = normalizeDate(date);
  if (!d) return new Date().getFullYear().toString();
  
  return d.getFullYear().toString();
}

/**
 * Parses various email date formats
 * Handles RFC2822 and common variations
 */
export function parseEmailDate(dateString: string | number | undefined): ParsedDate | null {
  if (!dateString) return null;
  
  let date: Date;
  
  try {
    if (typeof dateString === 'number') {
      // Unix timestamp (seconds or milliseconds)
      date = new Date(dateString < 10000000000 ? dateString * 1000 : dateString);
    } else {
      // Clean up the date string
      const cleaned = dateString
        .trim()
        // Remove day names (Mon, Tuesday, etc.)
        .replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s*/i, '')
        // Normalize timezone representations
        .replace(/\s+\(.*\)$/, '') // Remove (PST), (GMT), etc.
        .replace(/([+-]\d{4})\s+\(.*\)/, '$1'); // Keep offset, remove name
      
      date = new Date(cleaned);
      
      // If parsing failed, try some common formats
      if (isNaN(date.getTime())) {
        // Try ISO format variations
        const isoMatch = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (isoMatch) {
          date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        }
      }
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Check if date is reasonable (between 1990 and 10 years from now)
    const minDate = new Date('1990-01-01').getTime();
    const maxDate = new Date().getTime() + (10 * 365 * 24 * 60 * 60 * 1000);
    
    if (date.getTime() < minDate || date.getTime() > maxDate) {
      return null;
    }
    
    return {
      date,
      year: formatYear(date),
      month: formatMonth(date),
      timestamp: date.getTime()
    };
  } catch (error) {
    return null;
  }
}

/**
 * Gets current timestamp in ISO format for logging
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gets current timestamp in milliseconds
 */
export function getCurrentTimestampMs(): number {
  return Date.now();
}

/**
 * Formats a duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

/**
 * Calculates age of a date in human-readable format
 */
export function getDateAge(date: Date | string | number): string {
  const d = normalizeDate(date);
  if (!d) return 'unknown';
  
  const now = Date.now();
  const age = now - d.getTime();
  
  if (age < 0) {
    return 'future';
  }
  
  const days = Math.floor(age / (24 * 60 * 60 * 1000));
  
  if (days === 0) {
    return 'today';
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    const years = Math.floor(days / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
}

/**
 * Normalizes various date inputs to Date object
 */
function normalizeDate(date: Date | string | number): Date | null {
  if (!date) return null;
  
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Handle date-only strings specially to avoid timezone issues
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}
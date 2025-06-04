import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatMonth,
  formatYear,
  parseEmailDate,
  getCurrentTimestamp,
  getCurrentTimestampMs,
  formatDuration,
  getDateAge
} from '../../src/utils/date.utils';

describe('Date Utilities', () => {
  beforeEach(() => {
    // Mock current date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:30:00Z'));
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  describe('formatMonth', () => {
    it('should format month correctly', () => {
      expect(formatMonth(new Date('2024-01-15'))).toBe('01');
      expect(formatMonth(new Date('2024-12-25'))).toBe('12');
      expect(formatMonth('2024-06-01')).toBe('06');
      expect(formatMonth(new Date(2024, 0, 1).getTime())).toBe('01'); // Jan 1, 2024 in local time
    });
    
    it('should handle invalid dates', () => {
      expect(formatMonth('invalid')).toBe('00');
      expect(formatMonth('')).toBe('00');
      expect(formatMonth(null as any)).toBe('00');
    });
  });
  
  describe('formatYear', () => {
    it('should format year correctly', () => {
      expect(formatYear(new Date('2024-01-15'))).toBe('2024');
      expect(formatYear('2023-12-25')).toBe('2023');
      expect(formatYear(new Date(2024, 0, 15).getTime())).toBe('2024'); // Jan 15, 2024 in local time
    });
    
    it('should return current year for invalid dates', () => {
      expect(formatYear('invalid')).toBe('2024');
      expect(formatYear('')).toBe('2024');
      expect(formatYear(null as any)).toBe('2024');
    });
  });
  
  describe('parseEmailDate', () => {
    it('should parse RFC2822 dates', () => {
      const result = parseEmailDate('Mon, 15 Jan 2024 10:30:00 -0800');
      expect(result).not.toBeNull();
      expect(result?.year).toBe('2024');
      expect(result?.month).toBe('01');
    });
    
    it('should parse ISO dates', () => {
      const result = parseEmailDate('2024-03-15T10:30:00Z');
      expect(result).not.toBeNull();
      expect(result?.year).toBe('2024');
      expect(result?.month).toBe('03');
    });
    
    it('should parse Unix timestamps', () => {
      const result = parseEmailDate(1710500000); // seconds
      expect(result).not.toBeNull();
      expect(result?.year).toBe('2024');
      
      const resultMs = parseEmailDate(1710500000000); // milliseconds
      expect(resultMs).not.toBeNull();
      expect(resultMs?.year).toBe('2024');
    });
    
    it('should handle dates with timezone names', () => {
      const result = parseEmailDate('Wed, 15 Mar 2024 10:30:00 -0700 (PDT)');
      expect(result).not.toBeNull();
      expect(result?.year).toBe('2024');
      expect(result?.month).toBe('03');
    });
    
    it('should handle various date formats', () => {
      const formats = [
        '2024-03-15',
        'March 15, 2024',
        '15 Mar 2024',
        'Fri, 15 Mar 2024 10:30:00 GMT'
      ];
      
      formats.forEach(format => {
        const result = parseEmailDate(format);
        expect(result).not.toBeNull();
        expect(result?.year).toBe('2024');
        expect(result?.month).toBe('03');
      });
    });
    
    it('should return null for invalid dates', () => {
      expect(parseEmailDate('')).toBeNull();
      expect(parseEmailDate('invalid')).toBeNull();
      expect(parseEmailDate(undefined)).toBeNull();
      expect(parseEmailDate('1989-12-31')).toBeNull(); // Too old
      expect(parseEmailDate('2035-01-01')).toBeNull(); // Too far in future
    });
  });
  
  describe('getCurrentTimestamp', () => {
    it('should return ISO timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toBe('2024-03-15T10:30:00.000Z');
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
  
  describe('getCurrentTimestampMs', () => {
    it('should return milliseconds timestamp', () => {
      const timestamp = getCurrentTimestampMs();
      expect(timestamp).toBe(1710498600000); // Mocked time in ms
      expect(typeof timestamp).toBe('number');
    });
  });
  
  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });
    
    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(45000)).toBe('45s');
      expect(formatDuration(59999)).toBe('59s');
    });
    
    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(3599999)).toBe('59m 59s');
    });
    
    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h');
    });
  });
  
  describe('getDateAge', () => {
    it('should calculate age correctly', () => {
      // Current mocked time: 2024-03-15T10:30:00Z
      
      // Today
      expect(getDateAge(new Date('2024-03-15T08:00:00Z'))).toBe('today');
      
      // Yesterday
      expect(getDateAge(new Date('2024-03-14T10:30:00Z'))).toBe('yesterday');
      
      // Days ago
      expect(getDateAge(new Date('2024-03-12T10:30:00Z'))).toBe('3 days ago');
      expect(getDateAge(new Date('2024-03-10T10:30:00Z'))).toBe('5 days ago');
      
      // Weeks ago
      expect(getDateAge(new Date('2024-03-08T10:30:00Z'))).toBe('1 week ago');
      expect(getDateAge(new Date('2024-02-22T10:30:00Z'))).toBe('3 weeks ago');
      
      // Months ago
      expect(getDateAge(new Date('2024-02-01T10:30:00Z'))).toBe('1 month ago');
      expect(getDateAge(new Date('2023-12-15T10:30:00Z'))).toBe('3 months ago');
      
      // Years ago
      expect(getDateAge(new Date('2023-03-15T10:30:00Z'))).toBe('1 year ago');
      expect(getDateAge(new Date('2020-03-15T10:30:00Z'))).toBe('4 years ago');
    });
    
    it('should handle future dates', () => {
      expect(getDateAge(new Date('2024-03-16T10:30:00Z'))).toBe('future');
    });
    
    it('should handle invalid dates', () => {
      expect(getDateAge('invalid')).toBe('unknown');
      expect(getDateAge('')).toBe('unknown');
      expect(getDateAge(null as any)).toBe('unknown');
    });
  });
});
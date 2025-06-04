import { describe, it, expect } from 'vitest';
import {
  extractSenderInfo,
  formatSenderName,
  formatFilename,
  sanitizeFilename,
  truncateString,
  isValidFilename
} from '../../src/utils/filename.utils';

describe('Filename Utilities', () => {
  describe('extractSenderInfo', () => {
    it('should extract info from standard format', () => {
      const result = extractSenderInfo('John Doe <john.doe@example.com>');
      expect(result).toEqual({
        email: 'john.doe@example.com',
        name: 'John Doe',
        lastName: 'Doe'
      });
    });
    
    it('should handle "Last, First" format', () => {
      const result = extractSenderInfo('Doe, John <john.doe@example.com>');
      expect(result).toEqual({
        email: 'john.doe@example.com',
        name: 'Doe, John',
        lastName: 'Doe'
      });
    });
    
    it('should handle email only', () => {
      const result = extractSenderInfo('john.doe@example.com');
      expect(result).toEqual({
        email: 'john.doe@example.com',
        name: undefined,
        lastName: 'doe'
      });
    });
    
    it('should handle quoted names', () => {
      const result = extractSenderInfo('"John Doe" <john.doe@example.com>');
      expect(result).toEqual({
        email: 'john.doe@example.com',
        name: 'John Doe',
        lastName: 'Doe'
      });
    });
    
    it('should handle international characters', () => {
      const result = extractSenderInfo('María García <maria.garcia@example.com>');
      expect(result).toEqual({
        email: 'maria.garcia@example.com',
        name: 'María García',
        lastName: 'García'
      });
    });
    
    it('should handle complex email usernames', () => {
      const result = extractSenderInfo('john.smith-jr_2023@example.com');
      expect(result).toEqual({
        email: 'john.smith-jr_2023@example.com',
        name: undefined,
        lastName: '2023'
      });
    });
    
    it('should handle empty or invalid input', () => {
      expect(extractSenderInfo('')).toEqual({ email: 'unknown@unknown.com' });
      expect(extractSenderInfo(null as any)).toEqual({ email: 'unknown@unknown.com' });
      expect(extractSenderInfo('invalid')).toEqual({ email: 'unknown@unknown.com' });
    });
    
    it('should handle multiline sender strings', () => {
      const result = extractSenderInfo('John Doe\r\n<john.doe@example.com>');
      expect(result).toEqual({
        email: 'john.doe@example.com',
        name: 'John Doe',
        lastName: 'Doe'
      });
    });
  });
  
  describe('formatSenderName', () => {
    it('should format valid names', () => {
      expect(formatSenderName('Smith')).toBe('Smith');
      expect(formatSenderName('VeryLongLastNameThatExceedsLimit')).toBe('VeryLongLastNameT...');
    });
    
    it('should handle undefined names', () => {
      expect(formatSenderName(undefined)).toBe('Unknown');
      expect(formatSenderName('')).toBe('Unknown');
    });
    
    it('should respect custom max length', () => {
      expect(formatSenderName('Testing', 5)).toBe('Te...');
      expect(formatSenderName('Test', 10)).toBe('Test');
    });
  });
  
  describe('formatFilename', () => {
    it('should create properly formatted filename', () => {
      const result = formatFilename('3', 'Smith', 'invoice.pdf');
      expect(result).toBe('03_Smith_invoice.pdf');
    });
    
    it('should handle long filenames', () => {
      const longName = 'very_long_filename_that_exceeds_the_maximum_allowed_length_for_files.pdf';
      const result = formatFilename('12', 'Johnson', longName);
      expect(result).toMatch(/^12_Johnson_very_long_filename_that_exceeds_the_.*\.\.\.\.pdf$/);
      expect(result.length).toBeLessThanOrEqual(100);
    });
    
    it('should handle files without extensions', () => {
      const result = formatFilename('1', 'Doe', 'report');
      expect(result).toBe('01_Doe_report');
    });
    
    it('should handle files with multiple dots', () => {
      const result = formatFilename('5', 'Smith', 'report.final.v2.pdf');
      expect(result).toBe('05_Smith_report_final_v2.pdf');
    });
    
    it('should respect custom options', () => {
      const result = formatFilename('7', 'VeryLongLastName', 'file.txt', {
        maxSenderLength: 8,
        maxTotalLength: 30
      });
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toMatch(/^07_VeryL\.\.\._/);
    });
  });
  
  describe('sanitizeFilename', () => {
    it('should remove invalid characters', () => {
      expect(sanitizeFilename('file<>name.txt')).toBe('filename_txt');
      expect(sanitizeFilename('path/to\\file')).toBe('pathtofile');
      expect(sanitizeFilename('file:name*?.txt')).toBe('filename_txt');
    });
    
    it('should handle spaces and dots', () => {
      expect(sanitizeFilename('my file name.txt')).toBe('my_file_name_txt');
      expect(sanitizeFilename('file...name')).toBe('file_name');
    });
    
    it('should handle empty or invalid input', () => {
      expect(sanitizeFilename('')).toBe('unnamed');
      expect(sanitizeFilename('   ')).toBe('unnamed');
      expect(sanitizeFilename('***')).toBe('unnamed');
    });
    
    it('should handle unicode characters', () => {
      expect(sanitizeFilename('café_résumé.pdf')).toBe('café_résumé_pdf');
      expect(sanitizeFilename('文档.txt')).toBe('文档_txt');
    });
  });
  
  describe('truncateString', () => {
    it('should truncate long strings', () => {
      expect(truncateString('Hello World', 8)).toBe('Hello...');
      expect(truncateString('Test', 10)).toBe('Test');
    });
    
    it('should handle edge cases', () => {
      expect(truncateString('', 10)).toBe('');
      expect(truncateString('Test', 0)).toBe('');
      expect(truncateString('ABC', 3)).toBe('ABC');
      expect(truncateString('ABCD', 3)).toBe('ABC');
    });
  });
  
  describe('isValidFilename', () => {
    it('should validate correct filenames', () => {
      expect(isValidFilename('document.pdf')).toBe(true);
      expect(isValidFilename('01_Smith_invoice.pdf')).toBe(true);
      expect(isValidFilename('file-name_2023.txt')).toBe(true);
    });
    
    it('should reject invalid filenames', () => {
      expect(isValidFilename('')).toBe(false);
      expect(isValidFilename('file<name>.txt')).toBe(false);
      expect(isValidFilename('path/to/file.txt')).toBe(false);
      expect(isValidFilename('file?.txt')).toBe(false);
    });
    
    it('should reject reserved names', () => {
      expect(isValidFilename('CON.txt')).toBe(false);
      expect(isValidFilename('PRN.pdf')).toBe(false);
      expect(isValidFilename('aux.doc')).toBe(false);
      expect(isValidFilename('NUL')).toBe(false);
    });
    
    it('should respect length limits', () => {
      const longName = 'a'.repeat(101);
      expect(isValidFilename(longName)).toBe(false);
      expect(isValidFilename(longName.substring(0, 100))).toBe(true);
    });
  });
});
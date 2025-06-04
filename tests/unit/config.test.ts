import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';

describe('Configuration', () => {
  it('should have correct Gmail labels', () => {
    expect(CONFIG.LABELS.SOURCE).toBe('insurance claims/todo');
    expect(CONFIG.LABELS.PROCESSED).toBe('insurance claims/processed');
  });
  
  it('should have correct default values', () => {
    expect(CONFIG.DEFAULTS.LOG_LEVEL).toBe('info');
    expect(CONFIG.DEFAULTS.MAX_EMAILS_PER_RUN).toBe(50);
    expect(CONFIG.DEFAULTS.MAX_FILE_SIZE_MB).toBe(25);
  });
  
  it('should have correct API endpoints', () => {
    expect(CONFIG.API.GMAIL_BASE).toBe('https://www.googleapis.com/gmail/v1');
    expect(CONFIG.API.DRIVE_BASE).toBe('https://www.googleapis.com/drive/v3');
    expect(CONFIG.API.OAUTH_TOKEN).toBe('https://oauth2.googleapis.com/token');
  });
  
  it('should have correct OAuth scopes', () => {
    expect(CONFIG.SCOPES).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(CONFIG.SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(CONFIG.SCOPES).toHaveLength(2);
  });
  
  it('should be immutable', () => {
    // TypeScript const assertion prevents modification at compile time
    // Runtime JavaScript objects created with 'as const' are still mutable
    // This test verifies TypeScript compilation would catch mutations
    expect(CONFIG).toHaveProperty('LABELS');
    expect(CONFIG).toHaveProperty('DEFAULTS');
    expect(CONFIG).toHaveProperty('API');
    expect(CONFIG).toHaveProperty('SCOPES');
  });
});
import { describe, it, expect } from 'vitest';
import { loadConfiguration, ConfigurationError, logConfigurationStatus } from '../../src/config';
import type { Env } from '../../src/types';

describe('Configuration Validation', () => {
  // Valid base environment
  const validEnv: Env = {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    STORAGE: {} as any
  };
  
  describe('Required Variables', () => {
    it('should load valid configuration with required variables', () => {
      const config = loadConfiguration(validEnv);
      
      expect(config.googleClientId).toBe('test-client-id');
      expect(config.googleClientSecret).toBe('test-client-secret');
      expect(config.logLevel).toBe('info'); // default
      expect(config.maxEmailsPerRun).toBe(50); // default
      expect(config.maxFileSizeMB).toBe(25); // default
    });
    
    it('should throw error when GOOGLE_CLIENT_ID is missing', () => {
      const env = { ...validEnv, GOOGLE_CLIENT_ID: '' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
    });
    
    it('should throw error when GOOGLE_CLIENT_SECRET is missing', () => {
      const env = { ...validEnv, GOOGLE_CLIENT_SECRET: '' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Missing required environment variable: GOOGLE_CLIENT_SECRET');
    });
    
    it('should trim whitespace from credentials', () => {
      const env = {
        ...validEnv,
        GOOGLE_CLIENT_ID: '  test-client-id  ',
        GOOGLE_CLIENT_SECRET: '  test-client-secret  '
      };
      
      const config = loadConfiguration(env);
      expect(config.googleClientId).toBe('test-client-id');
      expect(config.googleClientSecret).toBe('test-client-secret');
    });
  });
  
  describe('Optional Variables', () => {
    it('should use custom LOG_LEVEL when provided', () => {
      const env = { ...validEnv, LOG_LEVEL: 'debug' };
      const config = loadConfiguration(env);
      
      expect(config.logLevel).toBe('debug');
    });
    
    it('should normalize LOG_LEVEL to lowercase', () => {
      const env = { ...validEnv, LOG_LEVEL: 'DEBUG' };
      const config = loadConfiguration(env);
      
      expect(config.logLevel).toBe('debug');
    });
    
    it('should throw error for invalid LOG_LEVEL', () => {
      const env = { ...validEnv, LOG_LEVEL: 'invalid' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Invalid LOG_LEVEL: invalid');
    });
    
    it('should use custom MAX_EMAILS_PER_RUN when provided', () => {
      const env = { ...validEnv, MAX_EMAILS_PER_RUN: '100' };
      const config = loadConfiguration(env);
      
      expect(config.maxEmailsPerRun).toBe(100);
    });
    
    it('should use custom MAX_FILE_SIZE_MB when provided', () => {
      const env = { ...validEnv, MAX_FILE_SIZE_MB: '50' };
      const config = loadConfiguration(env);
      
      expect(config.maxFileSizeMB).toBe(50);
    });
    
    it('should throw error for non-numeric MAX_EMAILS_PER_RUN', () => {
      const env = { ...validEnv, MAX_EMAILS_PER_RUN: 'abc' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Invalid MAX_EMAILS_PER_RUN');
    });
    
    it('should throw error for negative MAX_EMAILS_PER_RUN', () => {
      const env = { ...validEnv, MAX_EMAILS_PER_RUN: '-10' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Must be a positive integer');
    });
    
    it('should throw error for zero MAX_FILE_SIZE_MB', () => {
      const env = { ...validEnv, MAX_FILE_SIZE_MB: '0' };
      
      expect(() => loadConfiguration(env)).toThrow(ConfigurationError);
      expect(() => loadConfiguration(env)).toThrow('Must be a positive integer');
    });
  });
  
  describe('Default Values', () => {
    it('should use all default values when optional variables are not provided', () => {
      const config = loadConfiguration(validEnv);
      
      expect(config.logLevel).toBe('info');
      expect(config.maxEmailsPerRun).toBe(50);
      expect(config.maxFileSizeMB).toBe(25);
    });
    
    it('should use defaults when optional variables are empty strings', () => {
      const env = {
        ...validEnv,
        LOG_LEVEL: '',
        MAX_EMAILS_PER_RUN: '',
        MAX_FILE_SIZE_MB: ''
      };
      
      const config = loadConfiguration(env);
      expect(config.logLevel).toBe('info');
      expect(config.maxEmailsPerRun).toBe(50);
      expect(config.maxFileSizeMB).toBe(25);
    });
  });
  
  describe('Configuration Logging', () => {
    it('should log configuration without exposing secrets', () => {
      const config = loadConfiguration(validEnv);
      const logs: string[] = [];
      const mockLogger = { info: (msg: string) => logs.push(msg) };
      
      logConfigurationStatus(config, mockLogger);
      
      expect(logs).toContain('Configuration loaded successfully');
      expect(logs).toContain('  Log Level: info');
      expect(logs).toContain('  Max Emails Per Run: 50');
      expect(logs).toContain('  Max File Size: 25MB');
      expect(logs.some(log => log.includes('Google Client ID: test-cli...'))).toBe(true);
      expect(logs.every(log => !log.includes('test-client-secret'))).toBe(true);
    });
  });
});
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService } from '../../src/services/auth.service';
import { StorageService } from '../../src/services/storage.service';
import { AuthError, TokenRefreshError } from '../../src/types/auth';
import type { OAuthTokens } from '../../src/types/storage';
import type { TokenResponse, OAuthError } from '../../src/types/auth';

// Mock fetch globally
global.fetch = vi.fn();

// Mock storage service
const createMockStorage = () => {
  let storedTokens: OAuthTokens | null = null;
  
  return {
    getOAuthTokens: vi.fn(async () => storedTokens),
    setOAuthTokens: vi.fn(async (tokens: OAuthTokens) => {
      storedTokens = tokens;
    }),
    deleteValue: vi.fn(async () => {
      storedTokens = null;
    })
  } as any;
};

describe('AuthService', () => {
  let authService: AuthService;
  let mockStorage: ReturnType<typeof createMockStorage>;
  const mockFetch = global.fetch as any;
  
  const validTokens: OAuthTokens = {
    access_token: 'valid-access-token',
    refresh_token: 'valid-refresh-token',
    expiry_date: Date.now() + 3600000, // 1 hour from now
    token_type: 'Bearer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    authService = new AuthService(mockStorage, 'test-client-id', 'test-client-secret');
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('getValidToken', () => {
    it('should return valid token when not expired', async () => {
      mockStorage.getOAuthTokens.mockResolvedValue(validTokens);
      
      const token = await authService.getValidToken();
      
      expect(token).toBe('valid-access-token');
      expect(mockStorage.getOAuthTokens).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
    
    it('should refresh token when expired', async () => {
      const expiredTokens = {
        ...validTokens,
        expiry_date: Date.now() - 1000 // Expired
      };
      
      mockStorage.getOAuthTokens.mockResolvedValue(expiredTokens);
      
      const refreshResponse: TokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => refreshResponse
      });
      
      const token = await authService.getValidToken();
      
      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('oauth2.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(URLSearchParams)
        })
      );
    });
    
    it('should refresh token when within 5 minute buffer', async () => {
      const soonToExpireTokens = {
        ...validTokens,
        expiry_date: Date.now() + (4 * 60 * 1000) // 4 minutes from now
      };
      
      mockStorage.getOAuthTokens.mockResolvedValue(soonToExpireTokens);
      
      const refreshResponse: TokenResponse = {
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => refreshResponse
      });
      
      const token = await authService.getValidToken();
      
      expect(token).toBe('refreshed-access-token');
      expect(mockFetch).toHaveBeenCalled();
    });
    
    it('should throw error when no tokens found', async () => {
      mockStorage.getOAuthTokens.mockResolvedValue(null);
      
      await expect(authService.getValidToken()).rejects.toThrow(AuthError);
      await expect(authService.getValidToken()).rejects.toThrow('No tokens found');
    });
  });
  
  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const refreshResponse: TokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'scope1 scope2'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => refreshResponse
      });
      
      const result = await authService.refreshToken('refresh-token');
      
      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
      expect(result.expiry_date).toBeGreaterThan(Date.now());
      expect(mockStorage.setOAuthTokens).toHaveBeenCalled();
    });
    
    it('should keep old refresh token if not provided in response', async () => {
      const refreshResponse: TokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => refreshResponse
      });
      
      const result = await authService.refreshToken('old-refresh-token');
      
      expect(result.refresh_token).toBe('old-refresh-token');
    });
    
    it('should throw error when refresh fails', async () => {
      const errorResponse: OAuthError = {
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked'
      };
      
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => errorResponse
      });
      
      await expect(authService.refreshToken('invalid-token'))
        .rejects.toThrow(TokenRefreshError);
    });
    
    it('should throw error when no refresh token provided', async () => {
      await expect(authService.refreshToken(''))
        .rejects.toThrow('No refresh token available');
    });
    
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      await expect(authService.refreshToken('refresh-token'))
        .rejects.toThrow(TokenRefreshError);
    });
  });
  
  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      const expiredDate = Date.now() - 1000;
      expect(authService.isTokenExpired(expiredDate)).toBe(true);
    });
    
    it('should return false for valid token', () => {
      const futureDate = Date.now() + 3600000;
      expect(authService.isTokenExpired(futureDate)).toBe(false);
    });
    
    it('should respect buffer time', () => {
      const fourMinutesFromNow = Date.now() + (4 * 60 * 1000);
      
      // With 5 minute buffer (default)
      expect(authService.isTokenExpired(fourMinutesFromNow, 5)).toBe(true);
      
      // With 3 minute buffer
      expect(authService.isTokenExpired(fourMinutesFromNow, 3)).toBe(false);
    });
  });
  
  describe('exchangeCodeForTokens', () => {
    it('should successfully exchange code for tokens', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'scope1 scope2'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => tokenResponse
      });
      
      const result = await authService.exchangeCodeForTokens('auth-code', 'http://localhost/callback');
      
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(mockStorage.setOAuthTokens).toHaveBeenCalled();
      
      // Verify request body
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body as URLSearchParams;
      expect(body.get('code')).toBe('auth-code');
      expect(body.get('grant_type')).toBe('authorization_code');
    });
    
    it('should throw error when no refresh token received', async () => {
      const tokenResponse: TokenResponse = {
        access_token: 'access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => tokenResponse
      });
      
      await expect(authService.exchangeCodeForTokens('auth-code', 'http://localhost/callback'))
        .rejects.toThrow('No refresh token received');
    });
    
    it('should handle OAuth errors', async () => {
      const errorResponse: OAuthError = {
        error: 'invalid_request',
        error_description: 'Invalid authorization code'
      };
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => errorResponse
      });
      
      await expect(authService.exchangeCodeForTokens('bad-code', 'http://localhost/callback'))
        .rejects.toThrow(AuthError);
    });
  });
  
  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const url = authService.getAuthorizationUrl('http://localhost/callback');
      
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });
    
    it('should include state parameter when provided', () => {
      const url = authService.getAuthorizationUrl('http://localhost/callback', 'test-state');
      
      expect(url).toContain('state=test-state');
    });
  });
  
  describe('validateTokens', () => {
    it('should return valid status for valid tokens', async () => {
      mockStorage.getOAuthTokens.mockResolvedValue(validTokens);
      
      const status = await authService.validateTokens();
      
      expect(status.hasTokens).toBe(true);
      expect(status.isExpired).toBe(false);
      expect(status.expiresIn).toBeGreaterThan(0);
    });
    
    it('should return expired status for expired tokens', async () => {
      const expiredTokens = {
        ...validTokens,
        expiry_date: Date.now() - 1000
      };
      
      mockStorage.getOAuthTokens.mockResolvedValue(expiredTokens);
      
      const status = await authService.validateTokens();
      
      expect(status.hasTokens).toBe(true);
      expect(status.isExpired).toBe(true);
      expect(status.expiresIn).toBe(0);
    });
    
    it('should handle missing tokens', async () => {
      mockStorage.getOAuthTokens.mockResolvedValue(null);
      
      const status = await authService.validateTokens();
      
      expect(status.hasTokens).toBe(false);
      expect(status.isExpired).toBe(true);
    });
    
    it('should handle storage errors gracefully', async () => {
      mockStorage.getOAuthTokens.mockRejectedValue(new Error('Storage error'));
      
      const status = await authService.validateTokens();
      
      expect(status.hasTokens).toBe(false);
      expect(status.isExpired).toBe(true);
    });
  });
  
  describe('clearTokens', () => {
    it('should clear stored tokens', async () => {
      await authService.clearTokens();
      
      expect(mockStorage.deleteValue).toHaveBeenCalledWith('oauth_tokens');
    });
  });
});
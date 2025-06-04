/**
 * Authentication Service
 * Manages OAuth tokens with automatic refresh capabilities
 */

import { StorageService } from './storage.service';
import { CONFIG } from '../config';
import type { 
  OAuthCredentials, 
  TokenResponse, 
  StoredTokens,
  OAuthError,
  AuthConfig
} from '../types/auth';
import { 
  AuthError, 
  TokenExpiredError, 
  TokenRefreshError 
} from '../types/auth';
import type { OAuthTokens } from '../types/storage';

export class AuthService {
  private readonly config: AuthConfig;
  
  constructor(
    private readonly storage: StorageService,
    clientId: string,
    clientSecret: string
  ) {
    this.config = {
      clientId,
      clientSecret,
      tokenEndpoint: CONFIG.API.OAUTH_TOKEN,
      scopes: [...CONFIG.SCOPES]
    };
  }
  
  /**
   * Gets a valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    try {
      const tokens = await this.storage.getOAuthTokens();
      
      if (!tokens) {
        throw new AuthError('No tokens found. Please complete OAuth setup.');
      }
      
      // Check if token is expired or about to expire (5 minute buffer)
      if (this.isTokenExpired(tokens.expiry_date)) {
        const refreshedTokens = await this.refreshToken(tokens.refresh_token);
        return refreshedTokens.access_token;
      }
      
      return tokens.access_token;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      
      throw new AuthError(
        'Failed to get valid token',
        'TOKEN_RETRIEVAL_FAILED',
        undefined,
        error as Error
      );
    }
  }
  
  /**
   * Refreshes the access token using the refresh token
   */
  async refreshToken(refreshToken: string): Promise<StoredTokens> {
    if (!refreshToken) {
      throw new TokenRefreshError('No refresh token available');
    }
    
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      
      const data = await response.json() as TokenResponse | OAuthError;
      
      if (!response.ok || 'error' in data) {
        const error = data as OAuthError;
        throw new TokenRefreshError(
          `Token refresh failed: ${error.error} - ${error.error_description || 'Unknown error'}`
        );
      }
      
      const tokenResponse = data as TokenResponse;
      
      // Calculate expiry date (expires_in is in seconds)
      const expiryDate = Date.now() + (tokenResponse.expires_in * 1000);
      
      // Store the refreshed tokens
      const storedTokens: StoredTokens = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token || refreshToken, // Keep old refresh token if not provided
        expiry_date: expiryDate,
        token_type: tokenResponse.token_type,
        scope: tokenResponse.scope
      };
      
      await this.storeTokens(storedTokens);
      
      return storedTokens;
    } catch (error) {
      if (error instanceof TokenRefreshError) throw error;
      
      throw new TokenRefreshError(
        'Failed to refresh token',
        error as Error
      );
    }
  }
  
  /**
   * Checks if a token is expired or about to expire
   */
  isTokenExpired(expiryDate: number, bufferMinutes: number = 5): boolean {
    const bufferMs = bufferMinutes * 60 * 1000;
    return Date.now() >= (expiryDate - bufferMs);
  }
  
  /**
   * Stores tokens in KV storage
   */
  async storeTokens(tokens: StoredTokens): Promise<void> {
    const oauthTokens: OAuthTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_refresh: new Date().toISOString()
    };
    
    await this.storage.setOAuthTokens(oauthTokens);
  }
  
  /**
   * Exchanges authorization code for tokens (used in OAuth setup)
   */
  async exchangeCodeForTokens(
    code: string, 
    redirectUri: string
  ): Promise<StoredTokens> {
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      
      const data = await response.json() as TokenResponse | OAuthError;
      
      if (!response.ok || 'error' in data) {
        const error = data as OAuthError;
        throw new AuthError(
          `OAuth exchange failed: ${error.error} - ${error.error_description || 'Unknown error'}`,
          'OAUTH_EXCHANGE_FAILED',
          response.status
        );
      }
      
      const tokenResponse = data as TokenResponse;
      
      if (!tokenResponse.refresh_token) {
        throw new AuthError(
          'No refresh token received. Ensure offline access is requested.',
          'NO_REFRESH_TOKEN'
        );
      }
      
      // Calculate expiry date
      const expiryDate = Date.now() + (tokenResponse.expires_in * 1000);
      
      const storedTokens: StoredTokens = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expiry_date: expiryDate,
        token_type: tokenResponse.token_type,
        scope: tokenResponse.scope
      };
      
      await this.storeTokens(storedTokens);
      
      return storedTokens;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      
      throw new AuthError(
        'Failed to exchange authorization code for tokens',
        'EXCHANGE_FAILED',
        undefined,
        error as Error
      );
    }
  }
  
  /**
   * Generates the OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    });
    
    if (state) {
      params.append('state', state);
    }
    
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  
  /**
   * Validates current token status
   */
  async validateTokens(): Promise<{
    hasTokens: boolean;
    isExpired: boolean;
    expiresIn?: number;
  }> {
    try {
      const tokens = await this.storage.getOAuthTokens();
      
      if (!tokens) {
        return { hasTokens: false, isExpired: true };
      }
      
      const isExpired = this.isTokenExpired(tokens.expiry_date, 0);
      const expiresIn = isExpired ? 0 : Math.floor((tokens.expiry_date - Date.now()) / 1000);
      
      return {
        hasTokens: true,
        isExpired,
        expiresIn
      };
    } catch (error) {
      return { hasTokens: false, isExpired: true };
    }
  }
  
  /**
   * Clears stored tokens (for logout/reset)
   */
  async clearTokens(): Promise<void> {
    await this.storage.deleteValue('oauth_tokens');
  }
}
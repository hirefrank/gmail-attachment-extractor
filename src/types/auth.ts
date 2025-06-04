/**
 * Type definitions for authentication and OAuth operations
 */

// OAuth credentials from Google Cloud Console
export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri?: string;
}

// Token response from Google OAuth API
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// Stored token information
export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

// OAuth error response
export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}

// Authentication error types
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Token expired error
export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
    this.name = 'TokenExpiredError';
  }
}

// Token refresh error
export class TokenRefreshError extends AuthError {
  constructor(message: string, cause?: Error) {
    super(message, 'TOKEN_REFRESH_FAILED', 401, cause);
    this.name = 'TokenRefreshError';
  }
}

// OAuth setup parameters
export interface OAuthSetupParams {
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

// Auth service configuration
export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes: string[];
}
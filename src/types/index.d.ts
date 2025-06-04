// Type definitions for CloudFlare Worker environment

export interface Env {
  // Environment variables
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  LOG_LEVEL?: string;
  MAX_EMAILS_PER_RUN?: string;
  MAX_FILE_SIZE_MB?: string;
  DRIVE_FOLDER_ID?: string;
  DEBUG_MODE?: string;
  
  // KV namespace binding
  STORAGE: KVNamespace;
}

// Request context with CloudFlare specific properties
export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
}
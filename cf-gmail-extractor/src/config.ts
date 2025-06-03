// Configuration constants for the Gmail Attachment Extractor

export const CONFIG = {
  // Gmail label configuration
  LABELS: {
    SOURCE: 'insurance claims/todo',
    PROCESSED: 'insurance claims/processed'
  },
  
  // Processing limits
  DEFAULTS: {
    LOG_LEVEL: 'info',
    MAX_EMAILS_PER_RUN: 50,
    MAX_FILE_SIZE_MB: 25
  },
  
  // API endpoints
  API: {
    GMAIL_BASE: 'https://www.googleapis.com/gmail/v1',
    DRIVE_BASE: 'https://www.googleapis.com/drive/v3',
    OAUTH_TOKEN: 'https://oauth2.googleapis.com/token'
  },
  
  // OAuth scopes
  SCOPES: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive.file'
  ]
} as const;
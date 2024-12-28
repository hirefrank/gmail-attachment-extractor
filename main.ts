import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { ensureDir } from "https://deno.land/std@0.220.1/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.220.1/path/mod.ts";

// OAuth scopes required for the application
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',  // For reading messages and modifying labels
  'https://www.googleapis.com/auth/drive.file'     // For uploading to Drive
] as const;

// Default configuration values
const DEFAULT_CONFIG = {
  label: "Work",
  outputFolder: "Gmail Attachments"
} as const;

interface Config {
  credentials: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  };
  tokens: {
    access_token: string;
    refresh_token: string;
  };
  label?: string;
  outputFolder?: string;
}

class GmailAttachmentExtractor {
  private gmail;
  private drive;
  private tempDir = "temp_attachments";
  private labelCache: Map<string, string> = new Map(); // Cache for label IDs

  constructor(config: Config) {
    const auth = new google.auth.OAuth2(
      config.credentials.client_id,
      config.credentials.client_secret,
      config.credentials.redirect_uri
    );

    auth.setCredentials({
      access_token: config.tokens.access_token,
      refresh_token: config.tokens.refresh_token,
      scope: SCOPES.join(' '),
      token_type: 'Bearer'
    });

    this.gmail = google.gmail({ version: "v1", auth });
    this.drive = google.drive({ version: "v3", auth });
  }

  private async verifyPermissions(): Promise<void> {
    try {
      console.log('Verifying Gmail permissions...');
      const gmailTest = await this.gmail.users.labels.list({ userId: 'me' });
      console.log('Gmail permissions verified:', gmailTest.data.labels?.length, 'labels found');

      console.log('Verifying Drive permissions...');
      const driveTest = await this.drive.files.list({
        pageSize: 1,
        fields: 'files(id, name)'
      });
      console.log('Drive permissions verified:', driveTest.data.files?.length, 'files found');

      // Cache all labels for future use
      if (gmailTest.data.labels) {
        gmailTest.data.labels.forEach(label => {
          if (label.name && label.id) {
            this.labelCache.set(label.name, label.id);
          }
        });
      }

      console.log('All permissions verified successfully');
    } catch (error: unknown) {
      console.error('Permission verification failed:', error);
      if (error instanceof Error && 'response' in error) {
        const errorWithResponse = error as { response: { data: unknown } };
        console.error('Error details:', errorWithResponse.response.data);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Permission verification failed: ${errorMessage}`);
    }
  }

  private async getLabelId(labelName: string): Promise<string> {
    // Check cache first
    const cachedId = this.labelCache.get(labelName);
    if (cachedId) return cachedId;

    // If not in cache, refresh labels
    const response = await this.gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];

    // Update cache
    labels.forEach(label => {
      if (label.name && label.id) {
        this.labelCache.set(label.name, label.id);
      }
    });

    const labelId = this.labelCache.get(labelName);
    if (!labelId) {
      throw new Error(`Label "${labelName}" not found`);
    }

    return labelId;
  }

  private async verifyLabel(messageId: string, labelId: string): Promise<boolean> {
    const message = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    });
    return message.data.labelIds?.includes(labelId) || false;
  }

  private async modifyLabelsWithRetry(
    messageId: string,
    labelsToRemove: string[],
    labelsToAdd: string[],
    maxRetries = 3
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get label IDs
        const [removeIds, addIds] = await Promise.all([
          Promise.all(labelsToRemove.map(label => this.getLabelId(label))),
          Promise.all(labelsToAdd.map(label => this.getLabelId(label)))
        ]);

        // Verify original labels exist before trying to remove them
        for (const [label, id] of labelsToRemove.map((l, i) => [l, removeIds[i]])) {
          const exists = await this.verifyLabel(messageId, id);
          if (!exists) {
            console.warn(`Label "${label}" not found on message ${messageId}, skipping removal`);
            removeIds.splice(removeIds.indexOf(id), 1);
          }
        }

        console.log(`Attempt ${attempt} - Modifying labels for message ${messageId}:`, {
          removing: labelsToRemove,
          adding: labelsToAdd
        });

        const _result = await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            removeLabelIds: removeIds,
            addLabelIds: addIds,
          },
        });

        // Verify the modification
        const updatedMessage = await this.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
        });

        const success = {
          removedAll: removeIds.every(id => !updatedMessage.data.labelIds?.includes(id)),
          addedAll: addIds.every(id => updatedMessage.data.labelIds?.includes(id)),
        };

        if (!success.removedAll || !success.addedAll) {
          throw new Error(`Label modification verification failed: ${JSON.stringify(success)}`);
        }

        console.log(`Successfully modified labels for message ${messageId}`);
        return;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) throw error;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  private getSenderInfo(headers: gmail_v1.Schema$MessagePartHeader[] | undefined): { lastName: string; email: string } {
    const fromHeader = headers?.find(header => header.name?.toLowerCase() === 'from');
    const fromValue = fromHeader?.value || '';

    // Try to extract name and email from format: "First Last <email@domain.com>"
    const match = fromValue.match(/^(?:"?([^"]*)"?\s)?(?:<)?([^>]*)(?:>)?$/);

    if (match) {
      const [, fullName, email] = match;
      if (fullName) {
        // Split the full name and get the last part as last name
        const nameParts = fullName.trim().split(/\s+/);
        return {
          lastName: nameParts[nameParts.length - 1] || email.split('@')[0],
          email: email.trim()
        };
      }
      return {
        lastName: email.split('@')[0],
        email: email.trim()
      };
    }

    return {
      lastName: fromValue.split('@')[0],
      email: fromValue
    };
  }

  private formatSenderName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')  // Replace multiple underscores with single
      .replace(/^_|_$/g, '')   // Remove leading/trailing underscores
      .substring(0, 50);       // Limit length
  }

  private formatDate(date: Date): string {
    return (date.getMonth() + 1).toString().padStart(2, '0');
  }

  private formatFilename(originalFilename: string, sender: string, month: string): string {
    const lastDot = originalFilename.lastIndexOf('.');
    const ext = lastDot > -1 ? originalFilename.slice(lastDot).toLowerCase() : '';
    const nameWithoutExt = lastDot > -1 ? originalFilename.slice(0, lastDot) : originalFilename;

    const truncatedSender = sender.substring(0, 20);
    const truncatedOriginal = nameWithoutExt
      .substring(0, 50)
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');

    const newFilename = `${truncatedSender}_${month}_${truncatedOriginal}${ext}`;

    const maxLength = 100;
    if (newFilename.length > maxLength) {
      const availableSpace = maxLength - (month.length + truncatedSender.length + ext.length + 2);
      const truncatedName = truncatedOriginal.substring(0, Math.max(0, availableSpace));
      return `${month}_${truncatedSender}_${truncatedName}${ext}`;
    }

    return newFilename;
  }

  private async createFolderInDrive(folderName: string): Promise<string> {
    try {
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name)'
      });

      if (response.data.files && response.data.files.length > 0) {
        const folderId = response.data.files[0].id!;
        console.log(`Using existing folder: ${folderName} (${folderId})`);
        return folderId;
      }

      const createResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id",
      });

      console.log(`Created new folder: ${folderName} (${createResponse.data.id})`);
      return createResponse.data.id!;
    } catch (error: unknown) {
      console.error('Error creating folder in Drive:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        // deno-lint-ignore no-explicit-any
        console.error('Error details:', (error as any).response.data);
      }
      throw error;
    }
  }

  private async getOrCreateYearFolder(parentFolderId: string, year: string): Promise<string> {
    try {
      const response = await this.drive.files.list({
        q: `name='${year}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive',
        fields: 'files(id, name)'
      });

      if (response.data.files && response.data.files.length > 0) {
        const folderId = response.data.files[0].id!;
        console.log(`Using existing year folder: ${year} (${folderId})`);
        return folderId;
      }

      const createResponse = await this.drive.files.create({
        requestBody: {
          name: year,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId]
        },
        fields: "id",
      });

      console.log(`Created new year folder: ${year} (${createResponse.data.id})`);
      return createResponse.data.id!;
    } catch (error: unknown) {
      console.error('Error creating year folder:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        // deno-lint-ignore no-explicit-any
        console.error('Error details:', (error as any).response.data);
      }
      throw error;
    }
  }

  private async downloadAttachment(
    messageId: string,
    attachmentId: string,
    filename: string
  ): Promise<string> {
    try {
      const attachment = await this.gmail.users.messages.attachments.get({
        userId: "me",
        messageId: messageId,
        id: attachmentId,
      });

      if (!attachment.data.data) {
        throw new Error('No attachment data found');
      }

      await ensureDir(this.tempDir);

      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = join(this.tempDir, safeFilename);

      const data = Uint8Array.from(atob(attachment.data.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      await Deno.writeFile(filePath, data);

      return filePath;
    } catch (error: unknown) {
      console.error('Error downloading attachment:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        // deno-lint-ignore no-explicit-any
        console.error('Error details:', (error as any).response.data);
      }
      throw error;
    }
  }

  private async uploadToDrive(
    filePath: string,
    filename: string,
    mimeType: string,
    parentFolderId: string,
    year: string
  ): Promise<void> {
    try {
      const yearFolderId = await this.getOrCreateYearFolder(parentFolderId, year);
      const fileContent = await Deno.readFile(filePath);
      const blob = new Blob([fileContent], { type: mimeType });

      const oauth2Client = this.drive.context._options.auth as unknown as {
        credentials: { access_token?: string }
      };

      if (!oauth2Client?.credentials?.access_token) {
        throw new Error('No access token available');
      }

      const formData = new FormData();

      const metadata = JSON.stringify({
        name: filename,
        parents: [yearFolderId]
      });

      const metadataBlob = new Blob([metadata], { type: 'application/json' });
      formData.append('metadata', metadataBlob);
      formData.append('file', blob);

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${oauth2Client.credentials.access_token}`,
          },
          body: formData
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      console.log(`Successfully uploaded ${filename} to Drive`);
    } catch (error: unknown) {
      console.error('Error uploading to Drive:', error);
      if (error instanceof Error && 'response' in error &&
          error.response && typeof error.response === 'object' && 'data' in error.response) {
        console.error('Error details:', error.response.data);
      }
      throw error;
    }
  }

  private async isFileUploaded(filename: string): Promise<boolean> {
    try {
      const content = await Deno.readTextFile("./data/uploaded_files.json");
      const uploadedFiles: string[] = JSON.parse(content);
      return uploadedFiles.includes(filename);
    } catch (error) {
      console.error("Error reading uploaded files:", error);
      return false;
    }
  }

  private async markFileAsUploaded(filename: string): Promise<void> {
    try {
      const content = await Deno.readTextFile("./data/uploaded_files.json");
      const uploadedFiles: string[] = JSON.parse(content);
      uploadedFiles.push(filename);
      await Deno.writeTextFile("./data/uploaded_files.json", JSON.stringify(uploadedFiles, null, 2));
    } catch (error) {
      console.error("Error updating uploaded files:", error);
      throw error;
    }
  }

  public async extractAttachments(label: string, outputFolder: string): Promise<void> {
    try {
      await this.verifyPermissions();

      await ensureDir(this.tempDir);
      console.log(`Created temporary directory: ${this.tempDir}`);

      const folderId = await this.createFolderInDrive(outputFolder);

      const emails = await this.gmail.users.messages.list({
        userId: "me",
        q: `has:attachment label:${label}`,
      });

      if (!emails.data.messages) {
        console.log(`No emails found with label: ${label}`);
        return;
      }

      console.log(`Found ${emails.data.messages.length} emails to process`);

      for (const email of emails.data.messages) {
        const message = await this.gmail.users.messages.get({
          userId: "me",
          id: email.id!,
        });

        const internalDate = message.data.internalDate;
        if (!internalDate) {
          console.warn(`No date found for email ${email.id}, skipping`);
          continue;
        }

        const emailDate = new Date(parseInt(internalDate));
        const year = emailDate.getFullYear().toString();
        const month = this.formatDate(emailDate);

        const { lastName } = this.getSenderInfo(message.data.payload?.headers);
        const senderName = this.formatSenderName(lastName);

        console.log(`Processing email from ${senderName} (${month}/${year})`);

        const parts = message.data.payload?.parts || [];

        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            const newFilename = this.formatFilename(part.filename, senderName, month);

            if (await this.isFileUploaded(`${year}/${newFilename}`)) {
              console.log(`Skipping already uploaded file: ${year}/${newFilename}`);
              continue;
            }

            try {
              console.log(`Processing: ${newFilename}`);

              const filePath = await this.downloadAttachment(
                email.id!,
                part.body.attachmentId,
                newFilename
              );
              console.log(`Downloaded to: ${filePath}`);

              await this.uploadToDrive(
                filePath,
                newFilename,
                part.mimeType || "application/octet-stream",
                folderId,
                year
              );
              console.log(`Uploaded: ${newFilename} to year folder: ${year}`);

              await this.markFileAsUploaded(`${year}/${newFilename}`);

              await Deno.remove(filePath);

              // Use the existing "processed insurance claim" label format
              const processedLabel = label.replace("* insurance claim", "processed insurance claim");
              await this.modifyLabelsWithRetry(email.id!, [label], [processedLabel]);
            } catch (error: unknown) {
              if (error instanceof Error) {
                console.error(`Error processing ${newFilename}:`, error.message);
              } else {
                console.error(`Error processing ${newFilename}:`, String(error));
              }
              continue;
            }
          }
        }
      }

      try {
        await Deno.remove(this.tempDir, { recursive: true });
        console.log("Cleaned up temporary directory");
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error("Error cleaning up temp directory:", error.message);
        } else {
          console.error("Error cleaning up temp directory:", String(error));
        }
      }

      console.log("Finished extracting attachments!");
    } catch (error: unknown) {
      console.error("Error in extractAttachments:", error);
      throw error;
    }
  }
}

// Load config from file
const loadConfig = async (): Promise<Config> => {
  try {
    const configText = await Deno.readTextFile("./data/config.json");
    const config: Config = JSON.parse(configText);
    console.log('\nConfiguration loaded successfully');
    if (config.label) console.log(`Found label in config: ${config.label}`);
    if (config.outputFolder) console.log(`Found output folder in config: ${config.outputFolder}`);
    return config;
  } catch (error) {
    console.error("Error loading config.json. Have you run the OAuth setup script?");
    throw error;
  }
};

// Initialize uploaded_files.json if it doesn't exist
const initializeUploadedFiles = async () => {
  try {
    await Deno.stat("./data/uploaded_files.json");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await Deno.writeTextFile("./data/uploaded_files.json", JSON.stringify([]));
      console.log("Initialized uploaded_files.json with an empty array");
    } else {
      console.error("Error checking uploaded_files.json:", error);
    }
  }
};

// Initialize config.json if it doesn't exist
const initializeConfig = async () => {
  try {
    await Deno.stat("./data/config.json");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await Deno.writeTextFile("./data/config.json", JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log("Initialized config.json with default values");
    } else {
      console.error("Error checking config.json:", error);
    }
  }
};

// Main execution
export const main = async () => {
  try {
    console.log('\nStarting Gmail Attachment Extractor');

    await initializeConfig();
    await initializeUploadedFiles();

    const config = await loadConfig();

    const extractor = new GmailAttachmentExtractor(config);
    await extractor.extractAttachments(config.label || DEFAULT_CONFIG.label, config.outputFolder || DEFAULT_CONFIG.outputFolder);
  } catch (error) {
    console.error("Error in main:", error);
    throw error;
  }
};

if (import.meta.main) {
  await main();
}

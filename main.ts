import { google } from "npm:googleapis";
import { ensureDir } from "https://deno.land/std@0.220.1/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.220.1/path/mod.ts";

// Default configuration values
const DEFAULT_CONFIG = {
  label: "Work",
  outputFolder: "Gmail Attachments"
} as const;

// Default configuration values
const DEFAULT_CONFIG_JSON = {
  credentials: {
    client_id: "your_client_id",
    client_secret: "your_client_secret",
    redirect_uri: "http://localhost:9000/callback"
  },
  tokens: {
    access_token: "your_access_token",
    refresh_token: "your_refresh_token"
  },
  label: "default_label",
  outputFolder: "default_folder"
};

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

  constructor(config: Config) {
    const auth = new google.auth.OAuth2(
      config.credentials.client_id,
      config.credentials.client_secret,
      config.credentials.redirect_uri
    );

    auth.setCredentials({
      access_token: config.tokens.access_token,
      refresh_token: config.tokens.refresh_token,
      token_type: 'Bearer'
    });

    this.gmail = google.gmail({ version: "v1", auth });
    this.drive = google.drive({ version: "v3", auth });
  }

  private async createFolderInDrive(folderName: string): Promise<string> {
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
  }

  private async downloadAttachment(
    messageId: string,
    attachmentId: string,
    filename: string
  ): Promise<string> {
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
  }

  private async getOrCreateYearFolder(parentFolderId: string, year: string): Promise<string> {
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
        throw new Error(`Upload failed with status ${response.status}: ${await response.text()}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Upload failed: ${error.message}`);
      } else {
        throw new Error('Upload failed: Unknown error occurred');
      }
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
    }
  }

  public async extractAttachments(label: string, outputFolder: string): Promise<void> {
    try {
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
          console.warn(`No date found for email ${email.id}, using current year`);
          continue;
        }

        const emailDate = new Date(parseInt(internalDate));
        const year = emailDate.getFullYear().toString();
        console.log(`Processing email from year: ${year}`);

        const parts = message.data.payload?.parts || [];

        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            if (await this.isFileUploaded(`${year}/${part.filename}`)) {
              console.log(`Skipping already uploaded file: ${year}/${part.filename}`);
              continue;
            }

            try {
              console.log(`Processing: ${part.filename}`);

              const filePath = await this.downloadAttachment(
                email.id!,
                part.body.attachmentId,
                part.filename
              );
              console.log(`Downloaded to: ${filePath}`);

              await this.uploadToDrive(
                filePath,
                part.filename,
                part.mimeType || "application/octet-stream",
                folderId,
                year
              );
              console.log(`Uploaded: ${part.filename} to year folder: ${year}`);

              await this.markFileAsUploaded(`${year}/${part.filename}`);

              await Deno.remove(filePath);
            } catch (error: unknown) {
              if (error instanceof Error) {
                console.error(`Error processing ${part.filename}:`, error.message);
              } else {
                console.error(`Error processing ${part.filename}:`, String(error));
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
      console.error("Error:", error);
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

// Get configuration values with logging
const getConfigValue = (
  cmdArg: string | undefined,
  configValue: string | undefined,
  defaultValue: string,
  valueName: string
): string => {
  if (cmdArg) {
    console.log(`Using ${valueName} from command line: ${cmdArg}`);
    return cmdArg;
  }
  if (configValue) {
    console.log(`Using ${valueName} from data/config.json: ${configValue}`);
    return configValue;
  }
  console.log(`Using default ${valueName}: ${defaultValue}`);
  return defaultValue;
};

// Initialize uploaded_files.json if it doesn't exist
const initializeUploadedFiles = async () => {
  try {
    await Deno.stat("./data/uploaded_files.json");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await Deno.writeTextFile("./data/uploaded_files.json", JSON.stringify([]));
      console.log("Initialized uploaded_files.json");
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
      await Deno.writeTextFile("./data/config.json", JSON.stringify(DEFAULT_CONFIG_JSON, null, 2));
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

    const label = getConfigValue(
      Deno.args[0],
      config.label,
      DEFAULT_CONFIG.label,
      'label'
    );

    const outputFolder = getConfigValue(
      Deno.args[1],
      config.outputFolder,
      DEFAULT_CONFIG.outputFolder,
      'output folder'
    );

    const extractor = new GmailAttachmentExtractor(config);
    await extractor.extractAttachments(label, outputFolder);
  } catch (error) {
    console.error("\nError:", error);
    Deno.exit(1);
  }
};

// only executed if invoked from command line
if (import.meta.main) {
  await main();
}

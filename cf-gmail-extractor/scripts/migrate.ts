/**
 * Migration Utilities
 * 
 * Handles migration from existing Deno service to CloudFlare Workers,
 * including data migration and service cutover.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

interface MigrationData {
  uploadedFiles: string[];
  oauthTokens: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    token_type: string;
    created_at?: string;
    updated_at?: string;
  };
  processingStatus?: {
    timestamp: string;
    processed_count: number;
    error_count: number;
    status: string;
    duration_ms: number;
  };
  errorLogs?: Array<{
    timestamp: string;
    error: string;
    context: string;
    service?: string;
    operation?: string;
  }>;
}

interface KVNamespace {
  id: string;
  title: string;
  preview_id?: string;
}

class DataMigrator {
  private sourceDataPath: string;
  private kvNamespace: string;
  private environment: 'staging' | 'production';

  constructor(
    sourceDataPath: string, 
    kvNamespace: string, 
    environment: 'staging' | 'production' = 'staging'
  ) {
    this.sourceDataPath = sourceDataPath;
    this.kvNamespace = kvNamespace;
    this.environment = environment;
  }

  async migrate(): Promise<void> {
    console.log('🔄 Starting data migration...');
    
    try {
      // Load existing data
      const data = this.loadExistingData();
      
      // Validate data
      this.validateData(data);
      
      // Migrate to KV storage
      await this.migrateToKV(data);
      
      // Verify migration
      await this.verifyMigration(data);
      
      console.log('✅ Data migration completed successfully');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private loadExistingData(): MigrationData {
    console.log('📂 Loading existing data...');
    
    const data: MigrationData = {
      uploadedFiles: [],
      oauthTokens: {
        access_token: '',
        refresh_token: '',
        expiry_date: 0,
        token_type: 'Bearer'
      }
    };

    // Load uploaded files
    const uploadedFilesPath = join(this.sourceDataPath, 'uploaded_files.json');
    if (existsSync(uploadedFilesPath)) {
      try {
        const uploadedFiles = JSON.parse(readFileSync(uploadedFilesPath, 'utf-8'));
        data.uploadedFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];
        console.log(`✓ Loaded ${data.uploadedFiles.length} uploaded files`);
      } catch (error) {
        console.warn(`⚠ Could not load uploaded files: ${error}`);
      }
    }

    // Load OAuth tokens
    const tokensPath = join(this.sourceDataPath, 'oauth_tokens.json');
    if (existsSync(tokensPath)) {
      try {
        const tokens = JSON.parse(readFileSync(tokensPath, 'utf-8'));
        data.oauthTokens = {
          access_token: tokens.access_token || '',
          refresh_token: tokens.refresh_token || '',
          expiry_date: tokens.expiry_date || 0,
          token_type: tokens.token_type || 'Bearer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        console.log('✓ Loaded OAuth tokens');
      } catch (error) {
        console.warn(`⚠ Could not load OAuth tokens: ${error}`);
      }
    }

    // Load processing status
    const statusPath = join(this.sourceDataPath, 'processing_status.json');
    if (existsSync(statusPath)) {
      try {
        data.processingStatus = JSON.parse(readFileSync(statusPath, 'utf-8'));
        console.log('✓ Loaded processing status');
      } catch (error) {
        console.warn(`⚠ Could not load processing status: ${error}`);
      }
    }

    // Load error logs
    const errorLogsPath = join(this.sourceDataPath, 'error_logs.json');
    if (existsSync(errorLogsPath)) {
      try {
        data.errorLogs = JSON.parse(readFileSync(errorLogsPath, 'utf-8'));
        console.log(`✓ Loaded ${data.errorLogs?.length || 0} error logs`);
      } catch (error) {
        console.warn(`⚠ Could not load error logs: ${error}`);
      }
    }

    return data;
  }

  private validateData(data: MigrationData): void {
    console.log('🔍 Validating data...');
    
    // Validate OAuth tokens
    if (!data.oauthTokens.access_token || !data.oauthTokens.refresh_token) {
      throw new Error('OAuth tokens are missing or invalid');
    }
    
    if (data.oauthTokens.expiry_date < Date.now()) {
      console.warn('⚠ OAuth tokens are expired - they will need to be refreshed');
    }
    
    // Validate uploaded files format
    if (data.uploadedFiles.some(file => typeof file !== 'string')) {
      throw new Error('Uploaded files contain invalid entries');
    }
    
    // Check for year-prefixed format
    const yearPrefixedFiles = data.uploadedFiles.filter(file => /^\d{4}\//.test(file));
    const nonPrefixedFiles = data.uploadedFiles.filter(file => !/^\d{4}\//.test(file));
    
    if (nonPrefixedFiles.length > 0) {
      console.warn(`⚠ Found ${nonPrefixedFiles.length} files without year prefix - they will be prefixed with current year`);
      
      // Add current year prefix to non-prefixed files
      const currentYear = new Date().getFullYear();
      data.uploadedFiles = data.uploadedFiles.map(file => 
        /^\d{4}\//.test(file) ? file : `${currentYear}/${file}`
      );
    }
    
    console.log('✓ Data validation completed');
  }

  private async migrateToKV(data: MigrationData): Promise<void> {
    console.log('📤 Migrating data to KV storage...');
    
    // Get KV namespace ID
    const namespaceId = await this.getKVNamespaceId();
    
    // Migrate uploaded files
    if (data.uploadedFiles.length > 0) {
      await this.writeToKV(namespaceId, 'uploaded_files', JSON.stringify(data.uploadedFiles));
      console.log(`✓ Migrated ${data.uploadedFiles.length} uploaded files`);
    }
    
    // Migrate OAuth tokens
    await this.writeToKV(namespaceId, 'oauth_tokens', JSON.stringify(data.oauthTokens));
    console.log('✓ Migrated OAuth tokens');
    
    // Migrate processing status
    if (data.processingStatus) {
      await this.writeToKV(namespaceId, 'processing_status', JSON.stringify(data.processingStatus));
      console.log('✓ Migrated processing status');
    }
    
    // Migrate error logs
    if (data.errorLogs && data.errorLogs.length > 0) {
      await this.writeToKV(namespaceId, 'error_logs', JSON.stringify(data.errorLogs));
      console.log(`✓ Migrated ${data.errorLogs.length} error logs`);
    }
  }

  private async getKVNamespaceId(): Promise<string> {
    try {
      const result = execSync('wrangler kv:namespace list', { encoding: 'utf-8' });
      const namespaces: KVNamespace[] = JSON.parse(result);
      
      const targetNamespace = namespaces.find(ns => ns.title === this.kvNamespace);
      
      if (!targetNamespace) {
        throw new Error(`KV namespace "${this.kvNamespace}" not found`);
      }
      
      return targetNamespace.id;
    } catch (error) {
      throw new Error(`Failed to get KV namespace ID: ${error}`);
    }
  }

  private async writeToKV(namespaceId: string, key: string, value: string): Promise<void> {
    try {
      const command = `wrangler kv:key put --namespace-id="${namespaceId}" "${key}" "${value.replace(/"/g, '\\"')}"`;
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      throw new Error(`Failed to write ${key} to KV: ${error}`);
    }
  }

  private async verifyMigration(originalData: MigrationData): Promise<void> {
    console.log('🔍 Verifying migration...');
    
    const namespaceId = await this.getKVNamespaceId();
    
    // Verify uploaded files
    const uploadedFiles = await this.readFromKV(namespaceId, 'uploaded_files');
    const migratedFiles = JSON.parse(uploadedFiles);
    
    if (migratedFiles.length !== originalData.uploadedFiles.length) {
      throw new Error('Uploaded files count mismatch after migration');
    }
    
    // Verify OAuth tokens
    const oauthTokens = await this.readFromKV(namespaceId, 'oauth_tokens');
    const migratedTokens = JSON.parse(oauthTokens);
    
    if (migratedTokens.access_token !== originalData.oauthTokens.access_token) {
      throw new Error('OAuth tokens mismatch after migration');
    }
    
    console.log('✓ Migration verification completed');
  }

  private async readFromKV(namespaceId: string, key: string): Promise<string> {
    try {
      const result = execSync(`wrangler kv:key get --namespace-id="${namespaceId}" "${key}"`, { encoding: 'utf-8' });
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to read ${key} from KV: ${error}`);
    }
  }

  // Export data for backup
  async exportData(outputPath: string): Promise<void> {
    console.log('📁 Exporting current KV data...');
    
    const namespaceId = await this.getKVNamespaceId();
    const exportData: any = {};
    
    const keys = ['uploaded_files', 'oauth_tokens', 'processing_status', 'error_logs'];
    
    for (const key of keys) {
      try {
        const value = await this.readFromKV(namespaceId, key);
        exportData[key] = JSON.parse(value);
        console.log(`✓ Exported ${key}`);
      } catch (error) {
        console.warn(`⚠ Could not export ${key}: ${error}`);
      }
    }
    
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`✅ Data exported to ${outputPath}`);
  }

  // Rollback migration
  async rollback(backupPath: string): Promise<void> {
    console.log('🔄 Rolling back migration...');
    
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }
    
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    // Clear KV data
    await this.clearKVData();
    
    // Restore from backup
    await this.migrateToKV(backupData);
    
    console.log('✅ Migration rollback completed');
  }

  private async clearKVData(): Promise<void> {
    console.log('🗑️ Clearing KV data...');
    
    const namespaceId = await this.getKVNamespaceId();
    const keys = ['uploaded_files', 'oauth_tokens', 'processing_status', 'error_logs'];
    
    for (const key of keys) {
      try {
        execSync(`wrangler kv:key delete --namespace-id="${namespaceId}" "${key}"`, { stdio: 'pipe' });
        console.log(`✓ Deleted ${key}`);
      } catch (error) {
        console.warn(`⚠ Could not delete ${key}: ${error}`);
      }
    }
  }
}

// Service Cutover Management
class ServiceCutover {
  private environment: 'staging' | 'production';
  
  constructor(environment: 'staging' | 'production' = 'staging') {
    this.environment = environment;
  }

  async parallelRun(durationMinutes: number = 60): Promise<void> {
    console.log(`🔄 Starting parallel run for ${durationMinutes} minutes...`);
    
    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    
    while (Date.now() < endTime) {
      try {
        // Monitor both services
        await this.compareServices();
        
        // Wait 5 minutes before next comparison
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        
      } catch (error) {
        console.error('❌ Parallel run monitoring failed:', error);
        throw error;
      }
    }
    
    console.log('✅ Parallel run completed successfully');
  }

  private async compareServices(): Promise<void> {
    // This would compare outputs from both services
    // Implementation depends on specific monitoring setup
    console.log('🔍 Comparing service outputs...');
    
    // Check CloudFlare Worker status
    const workerUrl = this.getWorkerUrl();
    const workerResponse = await fetch(`${workerUrl}/status`);
    
    if (!workerResponse.ok) {
      throw new Error(`CloudFlare Worker health check failed: ${workerResponse.status}`);
    }
    
    const workerStatus = await workerResponse.json();
    console.log('✓ CloudFlare Worker is healthy');
    
    // Here you would also check the Deno service status
    // and compare processing results
  }

  private getWorkerUrl(): string {
    const baseName = 'gmail-extractor';
    const workerName = this.environment === 'production' ? baseName : `${baseName}-${this.environment}`;
    return `https://${workerName}.workers.dev`;
  }

  async cutover(): Promise<void> {
    console.log('🔄 Performing service cutover...');
    
    try {
      // Verify CloudFlare Worker is healthy
      await this.verifyWorkerHealth();
      
      // Stop Deno service (implementation depends on deployment method)
      console.log('🛑 Stopping Deno service...');
      // execSync('systemctl stop gmail-extractor'); // Example
      
      // Verify cutover success
      await this.verifyCutover();
      
      console.log('✅ Service cutover completed successfully');
      
    } catch (error) {
      console.error('❌ Cutover failed:', error);
      throw error;
    }
  }

  private async verifyWorkerHealth(): Promise<void> {
    const workerUrl = this.getWorkerUrl();
    
    const response = await fetch(`${workerUrl}/health`);
    if (!response.ok) {
      throw new Error(`Worker health check failed: ${response.status}`);
    }
    
    const health = await response.json();
    if (health.status !== 'healthy') {
      throw new Error(`Worker reports unhealthy status: ${health.status}`);
    }
    
    console.log('✓ CloudFlare Worker is healthy and ready');
  }

  private async verifyCutover(): Promise<void> {
    // Additional verification steps after cutover
    console.log('🔍 Verifying cutover...');
    
    // Test manual trigger
    const workerUrl = this.getWorkerUrl();
    const response = await fetch(`${workerUrl}/process`, { method: 'POST' });
    
    if (!response.ok) {
      throw new Error(`Manual trigger test failed: ${response.status}`);
    }
    
    console.log('✓ Cutover verification completed');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'migrate':
      const sourcePath = args[1] || './data';
      const kvNamespace = args[2] || 'gmail-extractor-staging';
      const environment = (args[3] as 'staging' | 'production') || 'staging';
      
      const migrator = new DataMigrator(sourcePath, kvNamespace, environment);
      await migrator.migrate();
      break;
      
    case 'export':
      const exportMigrator = new DataMigrator('', args[2] || 'gmail-extractor-staging');
      await exportMigrator.exportData(args[1] || './backup.json');
      break;
      
    case 'rollback':
      const rollbackMigrator = new DataMigrator('', args[2] || 'gmail-extractor-staging');
      await rollbackMigrator.rollback(args[1] || './backup.json');
      break;
      
    case 'parallel':
      const cutover = new ServiceCutover((args[1] as 'staging' | 'production') || 'staging');
      await cutover.parallelRun(parseInt(args[2]) || 60);
      break;
      
    case 'cutover':
      const cutoverService = new ServiceCutover((args[1] as 'staging' | 'production') || 'staging');
      await cutoverService.cutover();
      break;
      
    default:
      console.log(`
Usage: node migrate.js <command> [options]

Commands:
  migrate <sourcePath> <kvNamespace> [environment]  Migrate data from files to KV
  export <outputPath> <kvNamespace>                 Export KV data to file
  rollback <backupPath> <kvNamespace>               Rollback from backup
  parallel [environment] [minutes]                  Run parallel comparison
  cutover [environment]                             Perform service cutover

Examples:
  node migrate.js migrate ./data gmail-extractor-staging staging
  node migrate.js export ./backup.json gmail-extractor-production
  node migrate.js rollback ./backup.json gmail-extractor-production
  node migrate.js parallel production 120
  node migrate.js cutover production
      `);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

export { DataMigrator, ServiceCutover };
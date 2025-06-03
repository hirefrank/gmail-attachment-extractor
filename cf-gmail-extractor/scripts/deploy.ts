/**
 * Production Deployment Script
 * 
 * Handles deployment to CloudFlare Workers with comprehensive checks
 * and monitoring setup.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DeploymentConfig {
  environment: 'staging' | 'production';
  kvNamespace: string;
  cronSchedule: string;
  logLevel: string;
  maxEmailsPerRun: number;
  maxAttachmentSize: number;
}

interface DeploymentChecks {
  wranglerInstalled: boolean;
  configValid: boolean;
  environmentVariables: boolean;
  kvNamespaceExists: boolean;
  buildSuccessful: boolean;
  testsPass: boolean;
}

class ProductionDeployer {
  private config: DeploymentConfig;
  private projectRoot: string;

  constructor(environment: 'staging' | 'production' = 'staging') {
    this.projectRoot = process.cwd();
    this.config = this.loadDeploymentConfig(environment);
  }

  private loadDeploymentConfig(environment: string): DeploymentConfig {
    const configPath = join(this.projectRoot, 'deployment', `${environment}.json`);
    
    if (!existsSync(configPath)) {
      throw new Error(`Deployment config not found: ${configPath}`);
    }

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return {
      environment: environment as 'staging' | 'production',
      kvNamespace: config.kvNamespace || `gmail-extractor-${environment}`,
      cronSchedule: config.cronSchedule || '0 0 * * 0', // Sunday midnight UTC
      logLevel: config.logLevel || 'info',
      maxEmailsPerRun: config.maxEmailsPerRun || 50,
      maxAttachmentSize: config.maxAttachmentSize || 25 * 1024 * 1024
    };
  }

  async deploy(): Promise<void> {
    console.log(`🚀 Starting deployment to ${this.config.environment}...`);
    
    try {
      // Pre-deployment checks
      console.log('📋 Running pre-deployment checks...');
      const checks = await this.runPreDeploymentChecks();
      
      if (!this.allChecksPass(checks)) {
        throw new Error('Pre-deployment checks failed');
      }
      
      // Build and deploy
      console.log('🔨 Building project...');
      this.buildProject();
      
      console.log('📦 Deploying to CloudFlare Workers...');
      this.deployToCloudFlare();
      
      // Post-deployment verification
      console.log('✅ Running post-deployment verification...');
      await this.runPostDeploymentChecks();
      
      console.log(`🎉 Deployment to ${this.config.environment} completed successfully!`);
      
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      process.exit(1);
    }
  }

  private async runPreDeploymentChecks(): Promise<DeploymentChecks> {
    const checks: DeploymentChecks = {
      wranglerInstalled: false,
      configValid: false,
      environmentVariables: false,
      kvNamespaceExists: false,
      buildSuccessful: false,
      testsPass: false
    };

    // Check Wrangler CLI
    try {
      execSync('wrangler --version', { stdio: 'ignore' });
      checks.wranglerInstalled = true;
      console.log('✓ Wrangler CLI installed');
    } catch {
      console.error('✗ Wrangler CLI not found. Install with: npm install -g wrangler');
    }

    // Validate wrangler.toml
    try {
      const wranglerConfig = readFileSync(join(this.projectRoot, 'wrangler.toml'), 'utf-8');
      if (wranglerConfig.includes('name') && wranglerConfig.includes('main')) {
        checks.configValid = true;
        console.log('✓ wrangler.toml is valid');
      }
    } catch {
      console.error('✗ wrangler.toml not found or invalid');
    }

    // Check environment variables
    const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      checks.environmentVariables = true;
      console.log('✓ Required environment variables are set');
    } else {
      console.error(`✗ Missing environment variables: ${missingVars.join(', ')}`);
    }

    // Check KV namespace
    try {
      const result = execSync(`wrangler kv:namespace list`, { encoding: 'utf-8' });
      const namespaces = JSON.parse(result);
      const hasNamespace = namespaces.some((ns: any) => ns.title === this.config.kvNamespace);
      
      if (hasNamespace) {
        checks.kvNamespaceExists = true;
        console.log(`✓ KV namespace "${this.config.kvNamespace}" exists`);
      } else {
        console.log(`⚠ Creating KV namespace "${this.config.kvNamespace}"...`);
        execSync(`wrangler kv:namespace create "${this.config.kvNamespace}"`, { stdio: 'inherit' });
        checks.kvNamespaceExists = true;
      }
    } catch (error) {
      console.error(`✗ Failed to check/create KV namespace: ${error}`);
    }

    // Run tests
    try {
      console.log('🧪 Running tests...');
      execSync('npm test', { stdio: 'pipe' });
      checks.testsPass = true;
      console.log('✓ All tests pass');
    } catch (error) {
      console.error('✗ Tests failed');
      console.error(error);
    }

    // Test build
    try {
      execSync('npm run build', { stdio: 'pipe' });
      checks.buildSuccessful = true;
      console.log('✓ Build successful');
    } catch (error) {
      console.error('✗ Build failed');
    }

    return checks;
  }

  private allChecksPass(checks: DeploymentChecks): boolean {
    return Object.values(checks).every(check => check === true);
  }

  private buildProject(): void {
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Build failed: ${error}`);
    }
  }

  private deployToCloudFlare(): void {
    try {
      // Set environment variables for deployment
      const envVars = [
        `GOOGLE_CLIENT_ID="${process.env.GOOGLE_CLIENT_ID}"`,
        `GOOGLE_CLIENT_SECRET="${process.env.GOOGLE_CLIENT_SECRET}"`,
        `LOG_LEVEL="${this.config.logLevel}"`,
        `MAX_EMAILS_PER_RUN="${this.config.maxEmailsPerRun}"`,
        `MAX_ATTACHMENT_SIZE="${this.config.maxAttachmentSize}"`
      ].join(' ');

      // Deploy with environment variables
      const deployCommand = `${envVars} wrangler publish --env ${this.config.environment}`;
      execSync(deployCommand, { stdio: 'inherit' });

      // Set up cron trigger
      console.log('⏰ Setting up cron trigger...');
      execSync(`wrangler cron --schedule "${this.config.cronSchedule}"`, { stdio: 'inherit' });

    } catch (error) {
      throw new Error(`CloudFlare deployment failed: ${error}`);
    }
  }

  private async runPostDeploymentChecks(): Promise<void> {
    const workerUrl = this.getWorkerUrl();
    
    // Test worker endpoints
    const endpoints = [
      { path: '/', expectedStatus: 200 },
      { path: '/health', expectedStatus: [200, 503] },
      { path: '/setup', expectedStatus: 200 },
      { path: '/status', expectedStatus: 200 }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`🔍 Testing ${endpoint.path}...`);
        const response = await fetch(`${workerUrl}${endpoint.path}`);
        
        const expectedStatuses = Array.isArray(endpoint.expectedStatus) 
          ? endpoint.expectedStatus 
          : [endpoint.expectedStatus];
          
        if (expectedStatuses.includes(response.status)) {
          console.log(`✓ ${endpoint.path} responds correctly (${response.status})`);
        } else {
          throw new Error(`Unexpected status ${response.status}`);
        }
      } catch (error) {
        console.error(`✗ ${endpoint.path} failed: ${error}`);
        throw error;
      }
    }

    // Test cron trigger registration
    try {
      const cronInfo = execSync('wrangler cron list', { encoding: 'utf-8' });
      if (cronInfo.includes(this.config.cronSchedule)) {
        console.log('✓ Cron trigger registered successfully');
      } else {
        console.warn('⚠ Cron trigger may not be registered correctly');
      }
    } catch (error) {
      console.warn('⚠ Could not verify cron trigger registration');
    }

    console.log('🎯 Post-deployment checks completed');
  }

  private getWorkerUrl(): string {
    const workerName = this.getWorkerName();
    return `https://${workerName}.workers.dev`;
  }

  private getWorkerName(): string {
    try {
      const wranglerConfig = readFileSync(join(this.projectRoot, 'wrangler.toml'), 'utf-8');
      const nameMatch = wranglerConfig.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        const baseName = nameMatch[1];
        return this.config.environment === 'production' ? baseName : `${baseName}-${this.config.environment}`;
      }
    } catch (error) {
      console.warn('Could not determine worker name from wrangler.toml');
    }
    return `gmail-extractor-${this.config.environment}`;
  }

  // Rollback functionality
  async rollback(previousVersion?: string): Promise<void> {
    console.log('🔄 Starting rollback...');
    
    try {
      if (previousVersion) {
        console.log(`📦 Rolling back to version ${previousVersion}...`);
        execSync(`wrangler rollback ${previousVersion}`, { stdio: 'inherit' });
      } else {
        console.log('📦 Rolling back to previous version...');
        execSync('wrangler rollback', { stdio: 'inherit' });
      }

      // Verify rollback
      await this.runPostDeploymentChecks();
      console.log('✅ Rollback completed successfully');
      
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  // Health monitoring
  async monitorHealth(durationMinutes: number = 10): Promise<void> {
    const workerUrl = this.getWorkerUrl();
    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    let consecutiveFailures = 0;
    
    console.log(`🔍 Monitoring health for ${durationMinutes} minutes...`);
    
    while (Date.now() < endTime) {
      try {
        const response = await fetch(`${workerUrl}/health`);
        
        if (response.ok) {
          consecutiveFailures = 0;
          const health = await response.json();
          console.log(`✓ Health check passed - Status: ${health.status}`);
        } else {
          consecutiveFailures++;
          console.warn(`⚠ Health check returned ${response.status}`);
          
          if (consecutiveFailures >= 3) {
            throw new Error('Multiple consecutive health check failures');
          }
        }
      } catch (error) {
        consecutiveFailures++;
        console.error(`✗ Health check failed: ${error}`);
        
        if (consecutiveFailures >= 3) {
          console.error('❌ Multiple consecutive failures detected');
          throw new Error('Health monitoring failed - consider rollback');
        }
      }
      
      // Wait 30 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    console.log('✅ Health monitoring completed successfully');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const environment = (args[1] as 'staging' | 'production') || 'staging';
  
  const deployer = new ProductionDeployer(environment);
  
  switch (command) {
    case 'deploy':
      await deployer.deploy();
      break;
      
    case 'rollback':
      const version = args[2];
      await deployer.rollback(version);
      break;
      
    case 'monitor':
      const duration = parseInt(args[2]) || 10;
      await deployer.monitorHealth(duration);
      break;
      
    case 'check':
      // Just run checks without deploying
      const deployer2 = new ProductionDeployer(environment);
      const checks = await deployer2['runPreDeploymentChecks']();
      console.log('Check results:', checks);
      break;
      
    default:
      console.log(`
Usage: node deploy.js <command> [environment] [options]

Commands:
  deploy [staging|production]     Deploy to specified environment
  rollback [staging|production] [version]  Rollback to previous or specific version
  monitor [staging|production] [minutes]   Monitor health for specified duration
  check [staging|production]      Run pre-deployment checks only

Examples:
  node deploy.js deploy staging
  node deploy.js deploy production
  node deploy.js rollback production
  node deploy.js monitor staging 15
  node deploy.js check production
      `);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Deployment script failed:', error);
    process.exit(1);
  });
}

export { ProductionDeployer, type DeploymentConfig };
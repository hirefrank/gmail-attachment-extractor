# Production Deployment Guide

This guide covers the complete process for deploying the CloudFlare Workers Gmail Attachment Extractor to production.

## Pre-Deployment Checklist

### Environment Setup
- [ ] CloudFlare account with Workers plan activated
- [ ] Wrangler CLI installed and authenticated (`wrangler auth login`)
- [ ] Node.js 18+ installed
- [ ] Project dependencies installed (`npm install`)

### Google API Setup
- [ ] Google Cloud project created
- [ ] Gmail API enabled
- [ ] Google Drive API enabled
- [ ] OAuth 2.0 credentials created (Web application)
- [ ] Authorized redirect URIs configured
- [ ] Test OAuth flow completed

### CloudFlare Configuration
- [ ] KV namespace created (`gmail-extractor`)
- [ ] Environment variables configured in CloudFlare dashboard
- [ ] Custom domain configured (optional)

### Code Quality
- [ ] All unit tests passing (`npm test`)
- [ ] Type checking clean (`npm run typecheck`)
- [ ] Build successful (`npm run build`)
- [ ] E2E tests passing (`npm run test:e2e`)
- [ ] Performance tests within limits

## Environment Variables

### Required Environment Variables

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Optional Configuration
LOG_LEVEL="info"                    # debug, info, warn, error
MAX_EMAILS_PER_RUN="50"            # Maximum emails to process per run
MAX_ATTACHMENT_SIZE="26214400"      # 25MB in bytes
DEBUG_MODE="false"                 # Set to "true" to enable web endpoints
```

### CloudFlare Secrets

Set these in the CloudFlare Workers dashboard or via Wrangler:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put DEBUG_MODE  # Set to "false" for production (default)
```

## Deployment Process

### Deploy to Production

```bash
# Build and deploy
npm run deploy

# Run E2E tests
npm run test:e2e

# Monitor logs
wrangler tail
```

### Data Migration (First Time Only)

If migrating from an existing Deno service:

```bash
# Export existing data to backup
npm run migrate:export ./backup.json

# Migrate data from local files to KV
npm run migrate ./data
```

## Post-Deployment Verification

### Automatic Checks

The deployment script automatically verifies:
- [ ] Worker responds to health checks
- [ ] All endpoints return expected status codes
- [ ] Cron triggers are registered (weekly on Sundays and monthly on 1st)
- [ ] KV storage is accessible

### Manual Verification

1. **OAuth Setup**
   - Visit `https://your-worker.workers.dev/setup`
   - Complete OAuth authorization flow
   - Verify tokens are stored in KV

2. **Manual Processing**
   - Make POST request to `/process` endpoint
   - Verify emails are processed correctly
   - Check Gmail labels are updated
   - Confirm files are uploaded to Drive

3. **Cron Execution**
   - Wait for next scheduled run
   - Monitor CloudFlare Workers logs
   - Verify automated processing works

4. **Error Handling**
   - Check `/logs` endpoint for any errors
   - Verify error logging is working
   - Test rollback procedures

## Monitoring and Alerting

### CloudFlare Workers Analytics

Monitor these metrics in the CloudFlare dashboard:
- Request count and success rate
- CPU time usage
- Memory usage
- Error rate and types

### Custom Monitoring

- **Health Checks**: `/health` endpoint every 5 minutes
- **Error Logs**: `/logs` endpoint for error monitoring
- **Processing Status**: `/status` endpoint for last run information

### Alerting Setup

Configure alerts for:
- Worker error rate > 5%
- Consecutive health check failures
- CPU time approaching limits
- Memory usage approaching limits

## Troubleshooting

### Common Issues

1. **OAuth Token Expired**
   - Visit `/setup` to re-authorize
   - Check token expiration in KV storage
   - Verify refresh token is working

2. **Gmail API Rate Limits**
   - Check Google Cloud Console quotas
   - Implement exponential backoff
   - Consider reducing `MAX_EMAILS_PER_RUN`

3. **Drive Upload Failures**
   - Verify Drive API quotas
   - Check file size limits
   - Ensure proper folder permissions

4. **Cron Not Triggering**
   - Verify cron schedule syntax
   - Check CloudFlare Workers logs
   - Ensure worker is not disabled

### Log Analysis

```bash
# View recent error logs
curl https://your-worker.workers.dev/logs

# Monitor real-time logs
wrangler tail
```

## Rollback Procedures

### Automatic Rollback

```bash
# Rollback to previous version
npm run rollback:production

# Rollback to specific version
npm run rollback:production -- v20241201-120000
```

### Manual Rollback

1. **Via CloudFlare Dashboard**
   - Go to Workers > your-worker > Deployments
   - Click "Rollback" on previous version

2. **Via Wrangler CLI**
   ```bash
   wrangler rollback
   ```

3. **Data Rollback**
   ```bash
   # Restore from backup
   npm run migrate:rollback ./backup.json
   ```

## Performance Optimization

### CloudFlare Worker Limits

- **CPU Time**: 10-50ms per request (stay under 30ms)
- **Memory**: 128MB total (keep under 100MB)
- **Execution Time**: 30 seconds for HTTP, 15 minutes for cron

### Optimization Strategies

1. **Lazy Loading**: Services initialized only when needed
2. **Batch Processing**: Process multiple emails efficiently
3. **Streaming**: Use streaming for large file operations
4. **Caching**: Cache API responses where appropriate

### Performance Monitoring

```bash
# Run performance tests
npm run test:e2e -- --grep "Performance"

# Monitor worker metrics
wrangler metrics
```

## Security Considerations

### Secrets Management

- Never commit secrets to version control
- Use CloudFlare Workers secrets for sensitive data
- Rotate OAuth credentials regularly
- Monitor access logs

### Access Control

- Limit OAuth scope to minimum required
- Use service-specific Google accounts
- Implement rate limiting for manual triggers
- Monitor for suspicious activity
- Set DEBUG_MODE=false in production to disable web endpoints

### Data Protection

- Encrypt sensitive data in KV storage
- Implement proper error handling to avoid data leaks
- Regularly backup KV data
- Follow GDPR/privacy regulations

## Maintenance

### Regular Tasks

- [ ] Monitor error logs weekly
- [ ] Review performance metrics monthly
- [ ] Update dependencies quarterly
- [ ] Rotate OAuth credentials annually

### Updates and Patches

1. **Security Updates**
   - Deploy to staging first
   - Run full test suite
   - Monitor for 24 hours before production

2. **Feature Updates**
   - Use feature flags for gradual rollout
   - A/B test new functionality
   - Monitor metrics closely

3. **Dependency Updates**
   - Update dev dependencies first
   - Test in staging environment
   - Gradual production rollout

## Support and Escalation

### Issue Reporting

1. Check CloudFlare Workers logs
2. Review `/logs` endpoint
3. Check Google API quotas
4. Verify KV storage status

### Emergency Contacts

- CloudFlare Support: [CloudFlare Support Portal]
- Google Cloud Support: [Google Cloud Console]
- Internal Escalation: [Your Team Contacts]

### Documentation

- [CloudFlare Workers Docs](https://developers.cloudflare.com/workers/)
- [Gmail API Reference](https://developers.google.com/gmail/api)
- [Google Drive API Reference](https://developers.google.com/drive/api)
- Project README and code documentation
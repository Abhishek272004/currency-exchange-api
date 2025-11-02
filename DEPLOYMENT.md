# Deployment Guide

This guide explains how to deploy the Currency Exchange API to different platforms.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Vercel Deployment](#vercel-deployment)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [CI/CD Setup](#cicd-setup)
- [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

- Node.js 18.x or later
- npm or yarn
- Git
- Vercel account (for Vercel deployment)
- Docker (for Docker deployment)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=*

# Database Configuration
DATABASE_PATH=./data/exchange-rates.db

# Logging
LOG_LEVEL=info

# API Keys (if needed)
# EXCHANGE_RATE_API_KEY=your_api_key
```

## Vercel Deployment

1. **Install Vercel CLI** (if not installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel
   ```

   Follow the prompts to complete the deployment.

4. **Set Environment Variables in Vercel**:
   - Go to your project in the Vercel dashboard
   - Navigate to Settings > Environment Variables
   - Add all the environment variables from your `.env` file

## Docker Deployment

1. **Build the Docker image**:
   ```bash
   docker build -t currency-exchange-api .
   ```

2. **Run the Docker container**:
   ```bash
   docker run -d \
     --name currency-exchange-api \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     --env-file .env \
     currency-exchange-api
   ```

## Manual Deployment

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/currency-exchange-api.git
   cd currency-exchange-api
   ```

2. **Install dependencies**:
   ```bash
   npm ci --production
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

   Or use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name "currency-exchange-api"
   ```

## CI/CD Setup

The project includes a GitHub Actions workflow (`.github/workflows/ci-cd.yml`) that automatically runs tests and deploys to Vercel when changes are pushed to the `main` branch.

### Required Secrets

Add these secrets to your GitHub repository (Settings > Secrets):

- `VERCEL_TOKEN`: Your Vercel authentication token
- `VERCEL_ORG_ID`: Your Vercel organization ID
- `VERCEL_PROJECT_ID`: Your Vercel project ID
- `CODECOV_TOKEN` (optional): For code coverage reporting

## Monitoring and Maintenance

### Logging

- Application logs are written to `logs/` directory by default
- In production, consider using a log management service (e.g., Loggly, Papertrail)

### Health Check

The API includes a health check endpoint:
```
GET /health
```

### Database Maintenance

- The SQLite database is stored at `./data/exchange-rates.db` by default
- Regular backups are recommended
- Use the following command to backup the database:
  ```bash
  sqlite3 data/exchange-rates.db ".backup 'backup-$(date +%Y%m%d).db'"
  ```

### Updating the Application

1. Pull the latest changes:
   ```bash
   git pull origin main
   ```

2. Install any new dependencies:
   ```bash
   npm ci
   ```

3. Restart the application:
   ```bash
   pm2 restart currency-exchange-api
   ```

## Troubleshooting

- **Database issues**: Check write permissions for the database directory
- **Port conflicts**: Ensure the port specified in `.env` is available
- **Dependency issues**: Delete `node_modules` and run `npm ci`
- **Logs**: Check application logs in the `logs/` directory

## Support

For support, please open an issue in the GitHub repository.

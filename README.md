# Currency Exchange API

A real-time currency exchange rate API that provides up-to-date USD to ARS/BRL rates from multiple sources.

## Features

- Real-time currency exchange rates
- Multiple data sources for reliability
- Auto-refreshing data (every 60 seconds)
- RESTful API endpoints
- SQLite database for historical data

## Prerequisites

- Node.js 16+
- npm or yarn
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/currency-exchange-api.git
   cd currency-exchange-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   PORT=3000
   NODE_ENV=production
   ```

## Running Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/quotes` - Get current exchange rates
  - Query params:
    - `base` (optional): Base currency (default: USD)
    - `target` (optional): Comma-separated list of target currencies (e.g., ARS,BRL)

## Deployment

### Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

1. Install Heroku CLI and login
2. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```
3. Deploy to Heroku:
   ```bash
   git push heroku main
   ```

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fcurrency-exchange-api)

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origins (default: '*')

## Contributing

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

## License

MIT

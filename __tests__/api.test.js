const request = require('supertest');
const { createTestDb, createTestConfig } = require('./__utils__/testUtils');
const app = require('../src/server');
const db = require('../src/db');

// Mock the database module
jest.mock('../src/db');

describe('API Endpoints', () => {
  let server;
  
  beforeAll(async () => {
    // Start the server
    server = app.listen(0); // Use a random available port
  });

  afterAll((done) => {
    // Close the server
    server.close(done);
  });

  describe('GET /health', () => {
    test('should return 200 and status ok', async () => {
      const response = await request(server).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        environment: 'test'
      });
    });
  });

  describe('GET /quotes', () => {
    test('should return exchange rates from all sources', async () => {
      // Mock the database response
      db.getLatestRates.mockReturnValue([
        {
          base_currency: 'USD',
          target_currency: 'BRL',
          source_name: 'Test Source',
          source_url: 'https://test.com',
          buy_rate: 5.25,
          sell_rate: 5.35,
          timestamp: Date.now()
        }
      ]);

      const response = await request(server).get('/quotes?base=USD&target=BRL');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        timestamp: expect.any(String),
        quotes: [
          {
            base_currency: 'USD',
            target_currency: 'BRL',
            source_name: 'Test Source',
            source_url: 'https://test.com',
            buy_rate: 5.25,
            sell_rate: 5.35,
            timestamp: expect.any(Number)
          }
        ]
      });
    });
  });

  describe('GET /average', () => {
    test('should return average exchange rates', async () => {
      // Mock the database response
      db.calculateAverages.mockReturnValue({
        avg_buy_rate: 5.2,
        avg_sell_rate: 5.3,
        source_count: 3
      });

      const response = await request(server).get('/average?base=USD&target=BRL');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        average_buy_price: '5.2000',
        average_sell_price: '5.3000',
        quote_count: 3,
        timestamp: expect.any(String)
      });
    });
  });

  describe('GET /slippage', () => {
    test('should return slippage information', async () => {
      // Mock the database response
      db.calculateSlippage.mockReturnValue([
        {
          source_name: 'Test Source',
          source_url: 'https://test.com',
          buy_rate: 5.25,
          sell_rate: 5.35,
          buy_slippage_percent: '0.96',
          sell_slippage_percent: '0.94',
          timestamp: Date.now()
        }
      ]);

      const response = await request(server).get('/slippage?base=USD&target=BRL');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toMatchObject({
        source: 'Test Source',
        source_url: 'https://test.com',
        buy_price: 5.25,
        sell_price: 5.35,
        buy_price_slippage: '0.96',
        sell_price_slippage: '0.94',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error Handling', () => {
    test('should return 500 for server errors', async () => {
      // Force an error in the quotes endpoint
      db.getLatestRates.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(server).get('/quotes');
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch quotes',
        details: 'Database error'
      });
    });
  });
});

const axios = require('axios');

/**
 * Fetches and parses the USD to BRL rate from Wise
 * @returns {Promise<Object>} Object with buy_price and sell_price
 */
async function parseBrlWise() {
  try {
    // Wise API endpoint for USD to BRL rate
    const response = await axios.get('https://wise.com/rates/live', {
      params: {
        source: 'USD',
        target: 'BRL',
        length: 1,
        unit: 'day',
        resolution: 'hourly'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const rate = response.data[0]?.rate;
    if (!rate) throw new Error('No rate found in response');

    // Add a small spread for buy/sell
    const spread = 0.01; // 1% spread
    
    return {
      buy_price: rate * (1 - spread / 2),
      sell_price: rate * (1 + spread / 2),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Wise:', error.message);
    return null;
  }
}

module.exports = { parseBrlWise };

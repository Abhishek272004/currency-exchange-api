const axios = require('axios');

/**
 * Fetches and parses the USD to BRL rate from Nomad
 * @returns {Promise<Object>} Object with buy_price and sell_price
 */
async function parseBrlNomad() {
  try {
    // Nomad API endpoint for exchange rates
    const response = await axios.get('https://api.nomadglobal.com/api/v1/exchange-rates', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    // Find USD to BRL rate in the response
    const usdToBrl = response.data.rates?.find(rate => 
      rate.source_currency === 'USD' && rate.target_currency === 'BRL'
    );

    if (!usdToBrl) {
      throw new Error('USD to BRL rate not found in response');
    }
    
    return {
      buy_price: parseFloat(usdToBrl.buy_rate),
      sell_price: parseFloat(usdToBrl.sell_rate),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Nomad:', error.message);
    return null;
  }
}

module.exports = { parseBrlNomad };

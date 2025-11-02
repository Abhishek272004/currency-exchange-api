const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches and parses the USD to BRL rate from Nubank
 * @returns {Promise<Object>} Object with buy_price and sell_price
 */
async function parseBrlNubank() {
  try {
    // Nubank's exchange rate API endpoint
    const response = await axios.get('https://www.nubank.com.br/cambio/hoje/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(response.data);
    
    // The selector needs to be updated based on Nubank's actual HTML structure
    const rateText = $('.exchange-rate').first().text().trim();
    const rate = parseFloat(rateText.replace(/[^0-9.,]/g, '').replace(',', '.'));
    
    if (!rate || isNaN(rate)) {
      throw new Error('Could not parse rate from Nubank');
    }
    
    // Add a small spread for buy/sell
    const spread = 0.015; // 1.5% spread
    
    return {
      buy_price: rate * (1 - spread / 2),
      sell_price: rate * (1 + spread / 2),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Nubank:', error.message);
    return null;
  }
}

module.exports = { parseBrlNubank };

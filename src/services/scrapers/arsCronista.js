const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'Cronista';
const SOURCE_URL = 'https://www.cronista.com/MercadosOnline/dolar.html';

/**
 * Fetches and parses the USD to ARS rate from Cronista
 * @returns {Promise<Object>} Object with buy and sell prices
 */
async function fetchArsCronista() {
  try {
    // Fetch the page with proper headers
    const { data } = await axios.get(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    
    // Find the buy and sell prices in the HTML structure
    // Note: These selectors might need adjustment based on the actual page structure
    const buyPriceText = $('.buy-value').first().text().trim() || 
                        $('[data-market-currency="USD"] .buy-value').first().text().trim();
    const sellPriceText = $('.sell-value').first().text().trim() || 
                         $('[data-market-currency="USD"] .sell-value').first().text().trim();
    
    // Extract numbers from the text (remove currency symbols and commas)
    const extractNumber = (text) => {
      if (!text) return null;
      const match = text.replace(/\./g, '').replace(',', '.').match(/[0-9]+\.?[0-9]*/);
      return match ? parseFloat(match[0]) : null;
    };
    
    const buy = extractNumber(buyPriceText);
    const sell = extractNumber(sellPriceText);
    
    if (!buy) {
      throw new Error('Could not extract buy price from Cronista');
    }
    
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy,
      sell: sell || buy * 1.02, // Add 2% spread if sell price not available
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Cronista:', error.message);
    // Fallback to a reasonable rate if scraping fails
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: 800,
      sell: 820,
      timestamp: new Date().toISOString(),
      is_fallback: true
    };
  }
}

module.exports = { parseArsCronista: fetchArsCronista };

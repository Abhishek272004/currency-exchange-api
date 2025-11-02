const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'Nomad';
const SOURCE_URL = 'https://www.nomadprelo.com.br/';

// Helper function to parse price text
function parsePriceText(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, and replace comma with dot
  const numberStr = text
    .replace(/[^\d,]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(numberStr) || null;
}

/**
 * Fetches and parses the USD to BRL rate from Nomad
 * @returns {Promise<Object>} Object with buy and sell prices
 */
async function parseBrlNomad() {
  try {
    // Try the website first
    const { data } = await axios.get(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    
    // Try to find the rate in the page - these selectors might need adjustment
    const rateText = $('.exchange-rate-value').first().text().trim() || 
                    $('[data-currency="USD"]').first().text().trim();
    
    if (!rateText) {
      throw new Error('Could not find rate on Nomad page');
    }
    
    // Extract the numeric value from the text (e.g., "R$ 5,20" -> 5.20)
    const rateMatch = rateText.replace(/\./g, '').replace(',', '.').match(/\d+\.?\d*/);
    if (!rateMatch) {
      throw new Error('Invalid rate format from Nomad');
    }
    
    const rate = parseFloat(rateMatch[0]);
    if (isNaN(rate)) {
      throw new Error('Could not parse rate from Nomad');
    }
    
    // Add a small spread for buy/sell (2% spread)
    const spread = 0.02;
    
    return {
      currency: 'BRL',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: parseFloat((rate * (1 - spread / 2)).toFixed(4)),
      sell: parseFloat((rate * (1 + spread / 2)).toFixed(4)),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Nomad:', error.message);
    // Fallback to a reasonable rate if all methods fail
    return {
      currency: 'BRL',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: 5.10,
      sell: 5.20,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      error: error.message
    };
  }
}

module.exports = { parseBrlNomad };

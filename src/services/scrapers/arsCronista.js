const cheerio = require('cheerio');

/**
 * Parses the Cronista HTML to extract USD to ARS exchange rate
 * @param {string} html - The HTML content from Cronista
 * @returns {Object|null} Object with buy_price and sell_price or null if parsing fails
 */
function parseArsCronista(html) {
  try {
    const $ = cheerio.load(html);
    
    // Find the buy and sell prices in the HTML structure
    const buyPriceText = $('.buy-value').first().text().trim();
    const sellPriceText = $('.sell-value').first().text().trim();
    
    // Extract numbers from the text (remove currency symbols and commas)
    const extractNumber = (text) => {
      const match = text.replace(/\./g, '').replace(',', '.').match(/[0-9]+\.?[0-9]*/);
      return match ? parseFloat(match[0]) : null;
    };
    
    const buyPrice = extractNumber(buyPriceText);
    const sellPrice = extractNumber(sellPriceText);
    
    if (!buyPrice) return null;
    
    return {
      buy_price: buyPrice,
      sell_price: sellPrice || buyPrice * 1.02, // Add 2% spread if sell price not available
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error parsing Cronista data:', error);
    return null;
  }
}

module.exports = { parseArsCronista };

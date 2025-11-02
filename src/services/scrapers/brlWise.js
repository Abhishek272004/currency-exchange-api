const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'Wise';
const SOURCE_URL = 'https://wise.com/gb/currency-converter/usd-to-brl-rate';

// Helper function to parse price text
function parsePriceText(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, and replace comma with dot
  const numberStr = String(text)
    .replace(/[^\d,.]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(numberStr) || null;
}

// Helper function to make HTTP requests with retries
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios({
        url,
        timeout: 10000,
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://wise.com/',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(options.headers || {})
        }
      });
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Fetches and parses the USD to BRL rate from Wise
 * @returns {Promise<Object>} Object with buy and sell prices
 */
async function parseBrlWise() {
  try {
    // Try the public API first
    try {
      // First get the client configuration to get the API URL and version
      const configResponse = await fetchWithRetry('https://wise.com/gateway/v3/composer/wise/config.json', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-CSRF-TOKEN': 'undefined',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      const apiBaseUrl = configResponse.data?.api?.transferwise?.url || 'https://api.wise.com';
      const apiVersion = configResponse.data?.api?.transferwise?.version || 'v1';
      
      // Then get the exchange rate
      const response = await fetchWithRetry(`${apiBaseUrl}/${apiVersion}/rates`, {
        params: {
          source: 'USD',
          target: 'BRL'
        },
        headers: {
          'Accept': 'application/json',
          'X-CSRF-TOKEN': 'undefined',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      // The API might return an array of rates, find the one we need
      const rateData = Array.isArray(response.data) 
        ? response.data.find(r => r.source === 'USD' && r.target === 'BRL')
        : response.data;
      
      if (rateData?.rate) {
        const rate = parseFloat(rateData.rate);
        if (!isNaN(rate)) {
          // Add a small spread for buy/sell (1% spread)
          const spread = 0.01;
          return {
            currency: 'BRL',
            source: SOURCE,
            sourceUrl: SOURCE_URL,
            buy: parseFloat((rate * (1 - spread / 2)).toFixed(4)),
            sell: parseFloat((rate * (1 + spread / 2)).toFixed(4)),
            timestamp: new Date().toISOString(),
            rate_source: 'api'
          };
        }
      }
    } catch (apiError) {
      console.log('Wise API failed, falling back to web scraping:', apiError.message);
    }

    // If API fails, try web scraping with multiple selectors
    try {
      const { data } = await fetchWithRetry(SOURCE_URL, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.google.com/',
          'DNT': '1',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });

      const $ = cheerio.load(data);
      
      // Try to find the rate in the JSON-LD data
      const jsonLd = $('script[type="application/ld+json"]').html();
      if (jsonLd) {
        try {
          const jsonData = JSON.parse(jsonLd.replace(/^\s*<[^>]*>/, ''));
          if (jsonData.potentialAction?.target?.queryInput === 'required name=sourceAmount') {
            const rateMatch = jsonData.potentialAction.target.queryInput.match(/1 USD = ([\d.,]+) BRL/);
            if (rateMatch && rateMatch[1]) {
              const rate = parsePriceText(rateMatch[1]);
              if (rate) {
                const spread = 0.01; // 1% spread
                return {
                  currency: 'BRL',
                  source: SOURCE,
                  sourceUrl: SOURCE_URL,
                  buy: parseFloat((rate * (1 - spread / 2)).toFixed(4)),
                  sell: parseFloat((rate * (1 + spread / 2)).toFixed(4)),
                  timestamp: new Date().toISOString(),
                  rate_source: 'web_scraping_json_ld'
                };
              }
            }
          }
        } catch (e) {
          console.log('Failed to parse JSON-LD:', e.message);
        }
      }
      
      // Try different selectors to find the rate
      const rateSelectors = [
        // New Wise website selectors
        () => $('[data-testid="cc-amount-to"]').attr('value'),
        () => $('.success').first().text().trim(),
        // Try data attributes
        () => $('[data-rate]').first().attr('data-rate'),
        // Try the main rate display
        () => $('span.text-success').first().text(),
        // Try the rate in the conversion form
        () => $('input[name="cc-amount"]').attr('data-rate'),
        // Try to find any number that looks like an exchange rate
        () => {
          const rateText = $('body').text().match(/1\s*USD\s*[=≈]\s*([\d.,]+)\s*BRL/)?.[1];
          return rateText?.replace(/\./g, '').replace(',', '.');
        },
        // Try to find the rate in the page text
        () => {
          const text = $('body').text();
          const matches = text.match(/[1]\s*[=≈]\s*([\d.,]+)\s*BRL/);
          return matches ? matches[1].replace(/\./g, '').replace(',', '.') : null;
        },
        // Last resort: find any number that looks like an exchange rate
        () => {
          const text = $('body').text();
          const matches = text.match(/[\d.,]+/g) || [];
          // Filter for numbers that look like exchange rates (between 1 and 10)
          const rates = matches
            .map(match => parseFloat(match.replace(/\./g, '').replace(',', '.')))
            .filter(rate => rate > 1 && rate < 10);
          return rates.length > 0 ? rates[0].toString() : null;
        }
      ];
      
      // Try each selector until we find a valid rate
      let rate;
      for (const selector of rateSelectors) {
        try {
          const rateText = selector();
          if (rateText) {
            const parsedRate = parsePriceText(rateText);
            if (parsedRate && parsedRate > 1 && parsedRate < 10) {
              rate = parsedRate;
              break;
            }
          }
        } catch (e) {
          // Ignore and try next selector
          continue;
        }
      }
      
      if (rate) {
        const spread = 0.01; // 1% spread
        return {
          currency: 'BRL',
          source: SOURCE,
          sourceUrl: SOURCE_URL,
          buy: parseFloat((rate * (1 - spread / 2)).toFixed(4)),
          sell: parseFloat((rate * (1 + spread / 2)).toFixed(4)),
          timestamp: new Date().toISOString(),
          rate_source: 'web_scraping'
        };
      }
      
      throw new Error('Could not find exchange rate on Wise page');
    } catch (scrapeError) {
      console.log('Web scraping failed, using fallback rate:', scrapeError.message);
      // Fallback to a reasonable rate if all methods fail
      return {
        currency: 'BRL',
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        buy: 5.10,
        sell: 5.20,
        timestamp: new Date().toISOString(),
        is_fallback: true,
        error: scrapeError.message
      };
    }
  } catch (error) {
    console.error('Error fetching from Wise:', error.message);
    // Fallback to a reasonable rate if both API and scraping fail
    return {
      currency: 'BRL',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: 5.20,
      sell: 5.30,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      error: error.message
    };
  }
}

module.exports = { parseBrlWise };

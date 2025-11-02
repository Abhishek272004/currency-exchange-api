const http = require('../../utils/httpClient');

const SOURCE = 'ambito';
const SOURCE_URL = 'https://mercados.ambito.com/dolar/oficial';
const API_URL = 'https://mercados.ambito.com//dolar/oficial/variacion';

async function fetchAmbitoQuote() {
  const { data } = await http.get(API_URL);

  if (!Array.isArray(data) || data.length < 3) {
    throw new Error('Unexpected Ambito payload');
  }

  const buy = Number(String(data[1]).replace(',', '.'));
  const sell = Number(String(data[2]).replace(',', '.'));

  if (Number.isNaN(buy) || Number.isNaN(sell)) {
    throw new Error('Unable to parse Ambito quote');
  }

  return {
    currency: 'ARS',
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    buy,
    sell
  };
}

module.exports = fetchAmbitoQuote;

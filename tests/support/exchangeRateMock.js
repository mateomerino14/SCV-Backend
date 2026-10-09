const http = require('http');

// API de tipo de cambio falsa para las pruebas: responde tasas fijas o falla a pedido
const startExchangeRateMock = () => {
  const state = {failing: false, requests: 0};
  const server = http.createServer((req, res) => {
    state.requests += 1;
    const match = req.url.match(/^\/(\d{4}-\d{2}-\d{2})\/usd\.json$/);
    if (state.failing || !match) {
      res.writeHead(503);
      res.end('{}');
      return;
    }
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({date: match[1], usd: {pen: 3.75, eur: 0.88, ars: 1500, brl: 5.2, clp: 950, cop: 4100, mxn: 18.2}}));
  });
  return new Promise((resolve) => server.listen(0, () => {
    const url = `http://localhost:${server.address().port}/{fecha}/usd.json`;
    resolve({server, state, url});
  }));
};

module.exports = {startExchangeRateMock};

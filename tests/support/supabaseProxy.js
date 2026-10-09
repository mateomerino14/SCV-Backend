const http = require('http');

// Recibe las consultas del cliente de Supabase (/rest/v1/...) y las pasa a PostgREST sin las claves
const startSupabaseProxy = (port, postgrestUrl) => {
  const target = new URL(postgrestUrl);
  const server = http.createServer((req, res) => {
    const headers = {...req.headers, host: target.host};
    delete headers.authorization;
    delete headers.apikey;
    const forward = http.request({
      host: target.hostname,
      port: target.port,
      path: req.url.replace(/^\/rest\/v1/, ''),
      method: req.method,
      headers,
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    forward.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(forward);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
};

if (require.main === module) {
  const port = Number(process.env.SUPABASE_PROXY_PORT || 3998);
  startSupabaseProxy(port, process.env.POSTGREST_URL || 'http://localhost:3999').then(() => {
    console.log(`Proxy de Supabase para pruebas en http://localhost:${port}`);
  });
}

module.exports = {startSupabaseProxy};

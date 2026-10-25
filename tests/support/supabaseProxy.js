const http = require('http');

// Recibe las consultas del cliente de Supabase (/rest/v1/...) y las pasa a PostgREST sin las claves
const startSupabaseProxy = (port, postgrestUrl) => {
  const target = new URL(postgrestUrl);
  const removedFiles = [];
  const server = http.createServer((req, res) => {
    // Las pruebas consultan aqui que archivos se pidieron borrar
    if (req.url === '/__storage/removed') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(removedFiles));
      return;
    }
    // Las subidas a Storage se aceptan sin guardar nada; de los borrados se anotan las rutas
    if (req.url.startsWith('/storage/v1/object/')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (req.method === 'DELETE') {
          removedFiles.push(...(JSON.parse(body || '{}').prefixes || []));
        }
        res.writeHead(200, {'content-type': 'application/json'});
        if (req.url.startsWith('/storage/v1/object/list/')) {
          res.end('[]');
          return;
        }
        res.end(JSON.stringify({Key: req.url.replace('/storage/v1/object/', '')}));
      });
      return;
    }
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

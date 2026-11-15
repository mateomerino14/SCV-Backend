const http = require('http');

// Recibe las consultas del cliente de Supabase (/rest/v1/...) y las pasa a PostgREST sin las claves
const startSupabaseProxy = (port, postgrestUrl) => {
  const target = new URL(postgrestUrl);
  const removedFiles = [];
  const storedFiles = new Map();
  const server = http.createServer((req, res) => {
    // Las pruebas consultan aqui que archivos se pidieron borrar
    if (req.url === '/__storage/removed') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(removedFiles));
      return;
    }
    // Storage en memoria: guarda lo que se sube, lo devuelve al descargarlo y anota las rutas que se borran
    if (req.url.startsWith('/storage/v1/object/')) {
      const chunks = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const path = decodeURIComponent(req.url.replace('/storage/v1/object/', '').split('?')[0]);
        if (req.method === 'DELETE') {
          removedFiles.push(...(JSON.parse(body.toString() || '{}').prefixes || []));
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          storedFiles.set(path, body);
        }
        if (req.method === 'GET' && storedFiles.has(path)) {
          res.writeHead(200, {'content-type': 'application/pdf'});
          res.end(storedFiles.get(path));
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(404, {'content-type': 'application/json'});
          res.end(JSON.stringify({statusCode: '404', error: 'not_found', message: 'Object not found'}));
          return;
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

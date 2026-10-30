const request = require('supertest');
const app = require('../../src/app');

const testPassword = 'Prueba1234';
const boliviaOffsetHours = -4;

// Fecha de hoy en Bolivia mas los dias indicados, en formato AAAA-MM-DD
const boliviaDate = (extraDays = 0) => {
  const now = new Date(Date.now() + boliviaOffsetHours * 3600000 + extraDays * 86400000);
  return now.toISOString().slice(0, 10);
};

// Inicia sesion con un usuario de la organizacion de prueba y devuelve su token
const login = async (user) => {
  const response = await request(app).post('/auth').send({email_corporativo: `${user}@maxam.com`, contrasenia: testPassword});
  if (!response.body.token) {
    throw new Error(`No se pudo iniciar sesion con ${user}: ${response.body.error}`);
  }
  return response.body.token;
};

// PNG de 1x1 pixel para probar la subida de imagenes
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// Adjunta una imagen por cada campo indicado (por ejemplo ['imagen', 'respaldos'])
const attachImages = (pending, fields) => fields.reduce((current, field, index) => current.attach(field, tinyPng, {filename: `imagen${index}.png`, contentType: 'image/png'}), pending);

// Trazo de firma de prueba (PNG) para las aprobaciones que piden firmar
const testSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAYAAAA16j4lAAAB1klEQVR4Xu2Zy3HCQBiDITVQDuWnHHpIZg+eccw+9L83g75LDplgRVrJYG43QgghhBBCCCGZPB7Pn3a94yfJ5R55uV6or9d36DXJX76iDNmxsZ+4JiFtWoVb0eJPXRP3Bq/CrWCkaUetCBLdrg2eteT6u6wWI2ZkabGi8dC9wWfOxl1NRIy3gs5yhhYrPY2IbreANacrklm4vcYiZlXQdI3+F2R5XAJGzalo8cH12ruHPAq2gQR7YA4YncER6OGQgK7JriGPPGl6JeE2TAFrwpUKlCI9MDuFbJ3jHup30Zpwz6Atk2DRZPlbK7NDaS2EqsGVZkimXmJOVZM959ilwZ7herU4UpP0TQ3KLFj0NRBEL+Zp5IE15AxNniFHznEPeKIjjLQSpSlqrqPnWD3RUUZaWhytqeF1jaw5NjX4jOTNi4bZjHkav8LaZK+HFRaWE229RyJIDoxXq1C0IVfMsbjBqyZ5on2MKTkcWiQhRzyssDBscHZTEDLWZMQq5B3muEf3Y1JluKMQKzWdkaxaxrqseAt4ByMREyvNW+mr1HblbaKRr9WqqTZwdv1qbcuAG4fIKrH/wcCrR5qv8jIQParMZIdbBQnmCHl1zyOEEEIIIYQQP34BCsyK1WG1RtkAAAAASUVORK5CYII=';

// Rutas que piden la firma dibujada: aprobar el viaje, enviar la rendicion y aprobar la rendicion
const signedPaths = [/^\/approver\/trip\/\d+\/approve$/, /^\/review\/(trip|expense)-review\/\d+\/approve$/, /^\/approver\/alcohol-review\/\d+\/approve$/, /^\/trip\/\d+\/confirm-completion$/];

// Agrega la firma de prueba si la ruta la pide y la prueba no mando otra
const withSignature = (path, body) => {
  if (signedPaths.some((pattern) => pattern.test(path)) && !('firma' in body)) {
    return {...body, firma: testSignature};
  }
  return body;
};

// Cliente con el token ya puesto en la cabecera
const api = (token) => ({
  get: (path) => request(app).get(path).set('authorization', `Bearer ${token}`),
  post: (path, body = {}) => request(app).post(path).set('authorization', `Bearer ${token}`).send(withSignature(path, body)),
  put: (path, body = {}) => request(app).put(path).set('authorization', `Bearer ${token}`).send(withSignature(path, body)),
  del: (path) => request(app).delete(path).set('authorization', `Bearer ${token}`),
  patch: (path, body = {}) => request(app).patch(path).set('authorization', `Bearer ${token}`).send(body),
  postForm: (path, data, images = []) => attachImages(request(app).post(path).set('authorization', `Bearer ${token}`).field('datos', JSON.stringify(data)), images),
  putForm: (path, data, images = []) => attachImages(request(app).put(path).set('authorization', `Bearer ${token}`).field('datos', JSON.stringify(data)), images),
});

module.exports = {app, request, login, api, boliviaDate, testSignature};

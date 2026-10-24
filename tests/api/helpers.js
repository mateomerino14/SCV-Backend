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

// Cliente con el token ya puesto en la cabecera
const api = (token) => ({
  get: (path) => request(app).get(path).set('authorization', `Bearer ${token}`),
  post: (path, body = {}) => request(app).post(path).set('authorization', `Bearer ${token}`).send(body),
  put: (path, body = {}) => request(app).put(path).set('authorization', `Bearer ${token}`).send(body),
  postForm: (path, data, images = []) => attachImages(request(app).post(path).set('authorization', `Bearer ${token}`).field('datos', JSON.stringify(data)), images),
  putForm: (path, data, images = []) => attachImages(request(app).put(path).set('authorization', `Bearer ${token}`).field('datos', JSON.stringify(data)), images),
});

module.exports = {app, request, login, api, boliviaDate};

const request = require('supertest')
const app = require('../src/app')

// Verifica que la ruta raiz responda correctamente
test('GET / responde con Hello World', async () => {
  const response = await request(app).get('/')
  expect(response.status).toBe(200)
  expect(response.text).toBe('Hello World!')
})

// Verifica que la ruta de roles este protegida por autenticacion
test('GET /role sin token responde 401', async () => {
  const response = await request(app).get('/role')
  expect(response.status).toBe(401)
  expect(response.body.error).toBe('Acceso denegado, token no proporcionado')
})

// Verifica que la ruta de impuestos este protegida por autenticacion
test('GET /tax sin token responde 401', async () => {
  const response = await request(app).get('/tax')
  expect(response.status).toBe(401)
  expect(response.body.error).toBe('Acceso denegado, token no proporcionado')
})

// Verifica que la ruta de categorias de gasto este protegida por autenticacion
test('GET /expense-category sin token responde 401', async () => {
  const response = await request(app).get('/expense-category')
  expect(response.status).toBe(401)
  expect(response.body.error).toBe('Acceso denegado, token no proporcionado')
})
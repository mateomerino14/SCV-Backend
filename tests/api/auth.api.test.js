const {request, app, login, api} = require('./helpers');

// Un usuario de prueba inicia sesion y recibe un token
test('inicia sesion con credenciales correctas', async () => {
  const token = await login('juan.empleado');
  expect(token).toEqual(expect.any(String));
});

// Las credenciales incorrectas reciben el mismo mensaje, sin revelar si el correo existe
test('rechaza una contrasena incorrecta', async () => {
  const response = await request(app).post('/auth').send({email_corporativo: 'juan.empleado@maxam.com', contrasenia: 'incorrecta'});
  expect(response.status).toBe(401);
  expect(response.body.error).toBe('Correo o contraseña incorrectos');
});

// Las rutas protegidas exigen token
test('rechaza una ruta protegida sin token', async () => {
  const response = await request(app).get('/trip/dashboard');
  expect(response.status).toBe(401);
});

// Un empleado no puede entrar a las rutas del administrador
test('un empleado no accede al resumen del administrador', async () => {
  const token = await login('juan.empleado');
  const response = await api(token).get('/admin/dashboard');
  expect(response.status).toBe(403);
});

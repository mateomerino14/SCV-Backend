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

// El bloqueo por intentos fallidos es por cuenta: los demas usuarios de la misma red siguen entrando
test('el bloqueo de ingreso afecta solo a la cuenta que falló', async () => {
  const attempt = () => request(app).post('/auth').send({email_corporativo: 'bloqueo.prueba@maxam.com', contrasenia: 'incorrecta'});
  for (let index = 0; index < 10; index++) {
    await attempt();
  }
  const blocked = await attempt();
  expect(blocked.status).toBe(429);
  expect(blocked.body.error).toMatch(/esta cuenta/);
  const token = await login('juan.empleado');
  expect(token).toEqual(expect.any(String));
});

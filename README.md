# Sistema de Control de Viáticos — Backend

API REST del sistema de gestión de viajes corporativos y rendición de gastos de MAXAM.

## Requisitos

- Node.js 22.12 o superior (lo exige Puppeteer 25; `package.json` lo declara en `engines`)
- Un proyecto de Supabase con el esquema aplicado (ver `database/README.md`)

## Instalación

```bash
npm install
```

Crear un archivo `.env` en la raíz del proyecto (ver `.env.example`):

```
PORT=5000
NODE_ENV=development
SUPABASE_URL=...
SUPABASE_KEY=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
GEMINI_API_KEY=...
BREVO_API_KEY=...
ABSTRACT_EMAIL_API_KEY=...
FRONTEND_URL=...
```

| Variable | Propósito |
|---|---|
| `PORT` | Puerto donde escucha el servidor |
| `NODE_ENV` | Determina si la cookie del refresh token se marca `secure`/`sameSite=none` (producción) |
| `SUPABASE_URL` | Punto de acceso al proyecto de base de datos |
| `SUPABASE_KEY` | Clave de servicio para el acceso a los datos |
| `JWT_SECRET` | Clave de firma del token de acceso de corta duración |
| `JWT_REFRESH_SECRET` | Clave de firma del refresh token |
| `GEMINI_API_KEY` | Extracción de comprobantes y detección de alcohol (Google Generative AI) |
| `BREVO_API_KEY` | Envío de correo transaccional |
| `ABSTRACT_EMAIL_API_KEY` | Validación de existencia de direcciones de correo |
| `FRONTEND_URL` | URL del cliente web, usada en el botón "Ingresar al sistema" de los correos |
| `CORS_ORIGINS` | Opcional. Dominios del cliente web que pueden usar la API, separados por coma. Sin ella se aceptan `localhost:5173` y los dominios de Vercel del proyecto |
| `TRUST_PROXY` | Opcional. `true` si el servidor está detrás de un proxy (en Render no hace falta: se detecta solo con la variable `RENDER`) |
| `PUPPETEER_EXECUTABLE_PATH` | Opcional. Ruta a un Chrome/Chromium propio si no se usa el que descarga `puppeteer` al instalar |

En Render el servidor confía en el proxy de la plataforma (`trust proxy`) para leer la IP real de cada usuario; así el límite de intentos de ingreso se aplica por persona y no a todos juntos.

## Ejecución

```bash
npm run dev    # con recarga automática (nodemon)
npm start      # producción
npm test       # pruebas unitarias (Jest, sin base de datos)
npm run test:api   # pruebas de la API (necesitan una base de prueba; ver "Pruebas automáticas")
```

Al arrancar, el servidor programa (`node-cron`) el **resumen de pendientes**: un correo para supervisores, aprobadores, revisor y tesorero, solo a quienes tengan algo pendiente. Cada supervisor recibe solo sus propios pendientes (los asignados y los sin asignar que le corresponden por jerarquía), y al revisor se le incluyen las solicitudes de ampliación de plazo y de reemplazo. Si el envío a una persona falla, igual se envía a las demás.

**Los días y las horas los elige el administrador** en la pantalla *Recordatorios* (tabla `Configuracion_Recordatorio`): puede activarlos o desactivarlos, marcar los días de la semana y fijar hasta 4 horas por día. Al guardar, los envíos se reprograman en el momento, sin reiniciar el servidor. La configuración de fábrica es de lunes a viernes a las 08:00, 12:00 y 16:00. Las horas se calculan siempre en `America/La_Paz`, aunque el servidor esté en otra zona horaria.

Para enviarlo en el momento hay dos formas: los botones *Vista Previa* y *Enviar Ahora* de esa misma pantalla, o el comando (con el mismo `.env` del servidor):

```bash
npm run resumen -- --prueba   # solo muestra a quién le llegaría y qué diría, sin enviar
npm run resumen               # envía los correos
```

## Despliegue en un VPS

Guía para un servidor Ubuntu 22.04 o 24.04 con el frontend en Vercel (o en otro dominio). A diferencia de Render, en un VPS el proceso queda siempre encendido, por lo que el resumen de pendientes sale siempre a sus horas.

### 1. Node.js y el proyecto

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/mateomerino14/SCV-Backend.git
cd SCV-Backend
npm ci
```

### 2. Librerías para generar los PDF

Los recibos, memorándums y documentos se generan con Chrome sin pantalla (**Puppeteer 25**). `npm ci` descarga Chrome dentro del proyecto, en `.cache/puppeteer` (lo fija `.puppeteerrc.cjs`, para que Render lo conserve entre la compilación y la ejecución; la carpeta está en `.gitignore`), pero necesita estas librerías del sistema:

```bash
sudo apt-get install -y ca-certificates fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
  libxss1 libxtst6 xdg-utils
# Ubuntu 22.04: libasound2   |   Ubuntu 24.04: libasound2t64
sudo apt-get install -y libasound2t64 || sudo apt-get install -y libasound2
```

Para comprobarlo, una vez configurado el `.env`, se puede pedir un recibo desde el sistema: si faltara alguna librería, el registro del servidor muestra el error de Chromium.

### 3. Variables de entorno

Crear el `.env` con los mismos valores que en Render, y además:

```
NODE_ENV=production
PORT=5000
TRUST_PROXY=true
FRONTEND_URL=https://scv-frontend.vercel.app
# Solo si el frontend usa otro dominio:
# CORS_ORIGINS=https://viaticos.tuempresa.com,https://scv-frontend.vercel.app
```

- `NODE_ENV=production` marca la cookie de sesión como segura, requisito para que funcione con el frontend en otro dominio. Por eso el backend **debe** servirse por HTTPS (paso 5).
- `TRUST_PROXY=true` porque el servidor queda detrás de Nginx; sin ella el límite de intentos de ingreso trataría a todos los usuarios como una sola IP.

### 4. Mantenerlo encendido con pm2

```bash
sudo npm install -g pm2
pm2 start src/index.js --name scv-backend -i 1
pm2 save
pm2 startup        # ejecutar el comando que muestra, para que arranque con el VPS
```

Usar **una sola instancia** (`-i 1`, sin modo cluster): con varias, cada una enviaría el resumen de pendientes y llegaría duplicado. Comandos útiles: `pm2 logs scv-backend`, `pm2 restart scv-backend`.

### 5. Dominio y HTTPS con Nginx

Apuntar un subdominio (por ejemplo `api.tuempresa.com`) a la IP del VPS y luego:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/scv-backend > /dev/null <<'NGINX'
server {
  server_name api.tuempresa.com;
  client_max_body_size 15M;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
NGINX
sudo ln -s /etc/nginx/sites-available/scv-backend /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.tuempresa.com
```

`client_max_body_size` deja pasar los comprobantes (el servidor acepta hasta 8 MB por archivo); `proxy_read_timeout` da tiempo a la extracción de facturas y a la generación de PDF.

### 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

El puerto 5000 queda cerrado al exterior; solo Nginx lo usa.

### 7. Frontend

En Vercel, cambiar `VITE_API_URL` a `https://api.tuempresa.com` y volver a desplegar. Si el frontend pasa a un dominio propio, ponerlo en `CORS_ORIGINS` y en `FRONTEND_URL`, y reiniciar con `pm2 restart scv-backend`. Al definir `CORS_ORIGINS` se reemplaza la lista por defecto: si Vercel se sigue usando, incluir también su dominio.

### Actualizar a una nueva versión

```bash
cd SCV-Backend
git pull
npm ci
pm2 restart scv-backend
```

Si la versión trae cambios de base de datos, aplicarlos antes en Supabase (ver `database/README.md`).

## Stack

| Tecnología | Propósito |
|---|---|
| Express | Enrutamiento y middlewares HTTP |
| Supabase JS | Acceso a la base de datos y al almacenamiento |
| jsonwebtoken | Emisión y verificación de tokens |
| bcrypt | Cifrado de contraseñas |
| Multer | Procesamiento de archivos multiparte |
| Axios | Verificación de correos con AbstractAPI |
| Google Generative AI | Extracción de datos de comprobantes y detección de alcohol |
| Puppeteer 25 | Generación de PDF (memorándum, confirmación de fondos, rendición, planilla y recibos). Es un módulo ES: `pdfService` lo carga con `import()` al generar el primer PDF |
| node-cron | Resumen de pendientes por correo en los días y horas que configura el administrador |
| Brevo | Correo transaccional |
| Helmet + CORS | Cabeceras de seguridad y control de orígenes |
| express-rate-limit | Límite de intentos de acceso, recuperación de contraseña y extracción de facturas |

No se emplea ORM: las consultas se construyen con el constructor que provee el cliente de Supabase.

## Arquitectura

Arquitectura en capas con responsabilidades delimitadas. Toda petición atraviesa la misma secuencia.

```
Petición HTTP
   ▼
Router          Declara la ruta y encadena los middlewares
   ▼
Middleware      Autenticación, autorización por rol, límites
   ▼
Controller      Extrae parámetros, delega, formatea la respuesta
   ▼
Service         Reglas de negocio y acceso a datos
   ▼
Supabase        Persistencia
```

| Capa | Responsabilidad | Restricción |
|---|---|---|
| Router | Asociar ruta y verbo con su controlador | No contiene lógica |
| Middleware | Validar sesión, rol y restricciones de acceso | No accede a reglas de negocio |
| Controller | Leer la petición, invocar el servicio, responder | No consulta la base de datos |
| Service | Validar, consultar, orquestar | No conoce `req` ni `res` |

Un controlador siempre recibe `(req, res)`. Un servicio recibe parámetros explícitos y devuelve un objeto plano; ante un error de negocio retorna `{error, status}`, que el controlador traduce al código HTTP.

```javascript
const takeExpenseReview = async (req, res) => {
  const {tripId} = req.params
  const supervisorId = req.user.id_usuario
  const result = await reviewService.takeExpenseReview(tripId, supervisorId)
  if (result.error) {
    return res.status(result.status).json({error: result.error})
  }
  else {
    return res.json({message: result.message})
  }
};
```

## Estructura

```
src/
├── config/supabase.js       Cliente de conexión
├── routes/                  Declaración de rutas
│   ├── admin/                 admin
│   ├── approval/              review, reviewer, approver, treasurer,
│   │                          deadlineAuthorization, substitution
│   ├── catalog/               role, position, section, expenseCategory, tax, audit
│   ├── expense/               expense, invoice, supplier
│   ├── trip/                  trip
│   └── user/                  user, auth
├── controllers/             Misma división que routes
├── services/
│   ├── approval/              reviewService (supervisor), reviewerService,
│   │                          approverService, approverAlcoholReviewService,
│   │                          treasurerService, reviewLogService,
│   │                          selfReviewSkipService, deadlineAuthorizationService,
│   │                          substitutionService, expenseSummaryService,
│   │                          approvalMemoService, finalReviewDocumentService,
│   │                          treasuryDocumentService
│   ├── catalog/               positionService, sectionService
│   ├── expense/               expenseService, invoiceService,
│   │                          invoiceExtractionService, receiptService,
│   │                          supplierService
│   ├── trip/                  tripService, tripAccessService,
│   │                          tripCommentService, tripStatementService,
│   │                          tripExportService
│   ├── user/                  tokenService, userService, userImportService, userDirectoryService
│   └── shared/                alcoholDetectionService, auditLogService,
│                              commentModerationService, dailyDigestService,
│                              deadlineService, emailService, geminiService,
│                              hierarchyAssignmentService, pdfService,
│                              reminderScheduleService
├── middlewares/
│   ├── auth.js                     Token, cuenta activa, rol vigente, sesión invalidada
│   │                               y cambio de contraseña pendiente
│   ├── roleAuth.js                 Autorización por rol
│   ├── treasurerPosition.js        Restricción por cargo (tesorero)
│   ├── loginRateLimiter.js         Intentos fallidos de inicio de sesión
│   ├── passwordResetRateLimiter.js Envío y verificación de códigos de recuperación
│   └── invoiceExtractRateLimiter.js Extracciones de factura por usuario
├── utils/
│   ├── forbiddenWords.js     Catálogo de términos vedados
│   ├── htmlEscape.js         Escape de textos de usuario en correos y PDF
│   ├── numberToWords.js      Importes en letras
│   ├── requestData.js        Lectura segura de los datos enviados en formularios con archivo
│   ├── retentions.js         Retenciones de gastos sin factura (RC-IVA, IUE, IT) con base incrementada
│   ├── textNormalizer.js     Normalización para comparaciones y recorte de textos largos (asuntos de correo)
│   └── tripCode.js           Código legible de cada viaje
├── app.js                    Configuración de Express (seguridad, CORS, rutas)
└── index.js                  Arranque del servidor y programación del resumen de pendientes

scripts/sendDigest.js         Envío manual del resumen de pendientes (npm run resumen)
scripts/cleanStorage.js       Borra los archivos que ya no usa nadie (npm run limpiar-archivos)
database/                     Scripts SQL del esquema (ver su README.md)
tests/                        Pruebas: services/ (unitarias), api/ (de la API), support/ (ayudas)
.github/workflows/pruebas.yml Ejecución automática de las pruebas en GitHub Actions
```

## Rutas

| Prefijo | Archivo | Alcance |
|---|---|---|
| `/auth` | `user/auth.js` | Inicio y cierre de sesión, renovación, recuperación por código |
| `/user` | `user/user.js` | Perfil, cambio de contraseña y gestión de usuarios; `/user/import/preview` y `/user/import` (administrador) revisan y crean usuarios desde Excel |
| `/trip` | `trip/trip.js` | Ciclo de vida del viaje, planilla en PDF y datos de planillas de varios viajes para Excel (`/trip/export/statements`: revisor, tesorero y administrador) |
| `/expense` | `expense/expense.js` | Gastos y recibos; al registrar o editar un gasto sin factura se envía el comprobante (`imagen`) y, solo en viajes internacionales, hasta 2 respaldos (`respaldos`, para el comprobante del cambio de moneda; en un viaje nacional se responde 400); al editar, `respaldos_conservados` indica cuáles se mantienen |
| `/invoice` | `expense/invoice.js` | Extracción y registro de facturas |
| `/supplier` | `expense/supplier.js` | Proveedores (solo administrador) |
| `/review` | `approval/review.js` | Revisión previa y de gastos del supervisor |
| `/approver` | `approval/approver.js` | Aprobación del viaje y revisión adicional por alcohol |
| `/treasurer` | `approval/treasurer.js` | Asignación de fondos |
| `/reviewer` | `approval/reviewer.js` | Revisión final |
| `/deadline-authorization` | `approval/deadlineAuthorization.js` | Extensiones de plazo |
| `/substitution` | `approval/substitution.js` | Rendición por terceros |
| `/role`, `/position`, `/section`, `/expense-category`, `/tax`, `/audit` | `catalog/` | Catálogos e historial de accesos (el filtro de fechas usa días de Bolivia) |
| `/admin` | `admin/admin.js` | Resumen general del administrador (con periodo opcional `fecha_inicio` y `fecha_fin`; los montos por sección cuentan solo viajes con fondos entregados) y configuración de recordatorios |

Las imágenes de comprobantes y los productos de cada factura no tienen rutas propias: se gestionan solo a través de `/expense` y `/invoice`, que verifican dueño, etapa y plazo.

## Autorización

El middleware `roleAuth` recibe los roles habilitados y se declara en cada ruta, haciendo visible la restricción sin inspeccionar el controlador.

```javascript
router.post('/expense-review/:tripId/take',
  authMiddleware,
  roleMiddleware(['SUPERVISOR']),
  reviewController.takeExpenseReview)
```

El perfil de **Tesorero** no es un rol del sistema sino un cargo (`asistente de caja y tesorería`); su verificación usa `treasurerPosition`.

**Aprobador y revisor son roles únicos**: todo viaje de su etapa se les asigna directamente. **Supervisor** se resuelve por jerarquía (`hierarchyAssignmentService`): primero el jefe directo del empleado; si no lo hay, los supervisores de su sección; y si tampoco, cualquier supervisor. Un supervisor solo ve, toma u observa viajes que le corresponden por esa jerarquía, que tiene asignados o que ya revisó.

**Acceso a un viaje** (`tripAccessService`): el detalle, los gastos y el PDF los ven solo el dueño, su reemplazo aprobado, el tesorero, administrador, aprobador, revisor y el supervisor que corresponda. Los recibos los emiten el dueño, su reemplazo o el tesorero.

**Observaciones** (`tripCommentService`): solo las agrega quien tiene la etapa actual del viaje (por rol o cargo, y asignado cuando la etapa lo exige). No se editan ni borran una vez decidida la etapa ni en un ciclo anterior. Al borrar un gasto, sus observaciones se conservan.

## Sesión y seguridad

- **Tokens**: acceso de 15 minutos (en memoria del cliente) y refresco de 7 días en cookie `httpOnly`.
- **Validación en cada petición** (`auth.js`): cuenta activa, rol igual al del token y sesión no invalidada. Cambiar el rol o suspender a un usuario invalida sus sesiones al instante.
- **Contraseña temporal**: la cuenta nueva, una clave puesta por el administrador o un ingreso con código de recuperación marcan `debe_cambiar_contrasenia`, con su motivo en `motivo_cambio_contrasenia` (`TEMPORAL` o `RECUPERACION`) para que la ventana de cambio muestre el texto que corresponde. Mientras esté marcada, o la clave tenga más de 90 días, el servidor solo permite `/user/me` y el cambio de contraseña (403 con `codigo: CAMBIO_CONTRASENIA_REQUERIDO`). Con clave temporal o por recuperación no se pide la actual.
- **Cambio de contraseña**: cierra las demás sesiones y entrega una nueva al dispositivo que la cambió. Queda registrado en `Auditoria` (`CAMBIO_CLAVE`), igual que cada ingreso y salida.
- **Ingreso**: mismo mensaje si el correo no existe o la clave es incorrecta. Límite de 10 intentos fallidos cada 15 minutos **por cuenta** (IP + correo), de modo que los errores de un usuario no bloquean a los demás de la misma red; además, un tope de 100 fallos por IP frena a quien prueba muchas cuentas. Los ingresos correctos no cuentan. El envío y la verificación de códigos de recuperación siguen la misma regla (10 por cuenta y 50 por IP). Detrás de un proxy (Nginx) hay que poner `TRUST_PROXY=true` para que se vea la IP real de cada usuario. Cada código de recuperación se anula tras 5 intentos fallidos.
- **Concurrencia**: aprobar, rechazar, tomar, devolver, enviar y resolver solicitudes exigen el estado esperado al escribir. Si otra persona se adelantó, se responde 409 y no se duplican correos ni registros.
- **Documentos**: todo texto escrito por usuarios se escapa antes de insertarse en correos y PDF (`htmlEscape`); los PDF se generan con JavaScript desactivado y el navegador se cierra siempre.
- **Administración de usuarios**: solo se aceptan los campos del formulario y nunca se devuelve el hash de la contraseña. La importación desde Excel es solo para el administrador, admite hasta 500 filas y vuelve a validar todo en el servidor aunque el navegador ya haya mostrado la vista previa.
- **Tamaño de las peticiones**: el cuerpo JSON admite hasta 1 MB (`express.json`), suficiente para importar 500 usuarios; las imágenes van aparte, con su propio límite de `multer`.
- **Imágenes de comprobantes**: se suben al almacenamiento antes de escribir el gasto o la factura; si la subida falla no queda nada a medio guardar, y al editar la imagen anterior solo se reemplaza cuando la nueva ya se subió.

## Flujos de aprobación

### Primer flujo — autorización del viaje

```
BORRADOR → EN_REVISION_VIAJE → APROBADO_VIAJE → EN_REVISION_TESORERO → EN_CURSO
```

### Segundo flujo — rendición de gastos

```
                                    ┌─ (con alcohol) → EN_REVISION_APROBADOR ─┐
EN_CURSO → EN_REVISION ─────────────┤                                        ├──→ APROBADO_SUPERVISOR → APROBADO_FINAL
                                    └─ (sin alcohol) ────────────────────────┘
```

Cuando la rendición contiene alcohol (`Gasto.tiene_alcohol` en algún gasto, agregado en `Viaje.tiene_alcohol`), tras la aprobación del supervisor pasa primero por el aprobador (`approverAlcoholReviewService`) antes de llegar al revisor final.

El rechazo conduce a `RECHAZADO` e incrementa `ciclo_revision`. Solo las observaciones propias del ciclo vigente se consideran para validar un nuevo rechazo; el sistema exige al menos una antes de permitirlo (las de otros revisores no cuentan). Esta regla se aplica de forma idéntica en las 6 instancias de rechazo del sistema (supervisor ×2, aprobador, aprobador por alcohol, revisor).

Con la aprobación final, el correo y el PDF del empleado muestran el saldo de cada moneda por separado: en un viaje internacional puede corresponder devolver dólares y a la vez recibir un reembolso en bolivianos (o al revés), y cada línea lo dice.

Un viaje rechazado antes de iniciarse se corrige editándolo y vuelve a `EN_REVISION_VIAJE`; uno rechazado en la fase de gastos se corrige en sus gastos y se reenvía con "finalizar", directo a `EN_REVISION`. Ninguno puede saltar al otro flujo.

### Aprobación automática de etapas propias

Si el responsable de una etapa única (aprobador, tesorero o revisor) es el mismo viajero, esa etapa se aprueba sola (`selfReviewSkipService`) y los documentos lo indican como "aprobación automática". No aplica a supervisores: el viaje pasa a otro según la jerarquía. En el caso del tesorero, el fondo se aprueba con el monto que él mismo solicitó en el viaje.

### Historial de revisión

Cada aprobación o rechazo queda en `Revision_Viaje` con persona, etapa y fecha (`reviewLogService`). Las bandejas de cada revisor muestran en **Aprobados** todo lo que esa persona aprobó, con su estado actual, y en **Rechazados** solo lo que rechazó y sigue rechazado; al reenviarlo el empleado, sale de la lista. Las aprobaciones automáticas no cuentan.

### Rendición por terceros

Un empleado puede solicitar que otra persona rinda los gastos de su viaje en su nombre (`substitutionService`). El revisor aprueba o rechaza la solicitud; un viaje tiene a lo sumo una sustitución aprobada. El titular conserva siempre el acceso a su viaje (puede seguir registrando gastos y confirmar la finalización); si el sustituto es dado de baja, simplemente ya no puede ingresar y el viaje sigue en manos del titular. El plazo para registrar gastos es del viaje: una ampliación aprobada vale para el titular y para su reemplazo, y cualquiera de los dos puede pedirla (la respuesta se avisa a ambos). Si el viaje se envía a revisión antes de que el revisor responda, la solicitud de reemplazo (y la de ampliación de plazo) se cierra sola, con el motivo registrado, y ya no aparece como pendiente. El viaje aparece en el dashboard del sustituto etiquetado con el nombre del titular, pero los documentos (memorándum, recibos, planilla) siempre conservan el nombre del titular original, ya que se generan a partir de `Viaje.id_usuario`, que nunca cambia.

### Importación de usuarios desde Excel

El administrador puede cargar hasta 500 personas a la vez (`userImportService`). El frontend lee el Excel y envía las filas; el backend es quien valida, con las mismas reglas del formulario:

- `POST /user/import/preview` revisa cada fila y devuelve sus errores **sin guardar nada**.
- `POST /user/import` vuelve a validar, crea solo las filas correctas y devuelve cuántas creó y qué filas omitió y por qué.

Controles de cada fila: nombre, apellido paterno, correo y cargo obligatorios; letras en nombres (hasta 30), correo válido, teléfono de 7 u 8 números, dependencia de Oracle de 3 dígitos; cargo y sección activos buscados por nombre (sin importar mayúsculas ni tildes) y rol válido (vacío = EMPLEADO); **correo o CI que ya existen en el sistema o que se repiten en el archivo** (se marcan todas las filas repetidas, para que el administrador decida cuál es la correcta); roles y cargos de una sola persona (aprobador, revisor y los cargos únicos) ocupados o repetidos; jefe directo por correo, que puede estar en el sistema o en otra fila del archivo (si la fila del jefe tiene errores, la del subordinado tampoco se crea, y se detectan jefes en ciclo). Los usuarios se crean por niveles, primero los jefes y después sus subordinados; cada uno recibe en segundo plano el correo de bienvenida con su contraseña temporal (`userService.sendWelcomeEmail`, el mismo del formulario) y debe cambiarla al primer ingreso.

## Servicios transversales

| Servicio | Responsabilidad |
|---|---|
| `hierarchyAssignmentService` | Resuelve quién revisa cada etapa (jefe directo, sección o roles únicos) |
| `deadlineService` | Valida la fecha del gasto contra el período del viaje y el plazo de carga, considerando extensiones; no bloquea las correcciones de un rechazo |
| `alcoholDetectionService` | Detecta bebidas alcohólicas en los productos facturados o en la descripción del gasto, por gasto y agregado por viaje. Compara palabras completas ("ron" no coincide con "patrón"), reconoce como inocuos el combustible y sus abreviaturas de surtidor (G.ESPECIAL+, G.PREMIUM, D.OIL) y solo consulta a la IA los productos dudosos, pidiéndole marcar únicamente lo que es claramente alcohol. Un gasto con alcohol pierde el crédito fiscal y las retenciones; al editar y guardar el gasto se vuelve a analizar |
| `geminiService` | Llamadas al modelo con reintentos y modelo de respaldo ante cuota agotada |
| `commentModerationService` | Verifica que el texto no contenga términos prohibidos |
| `auditLogService` | Registra ingresos, salidas y cambios de contraseña |
| `dailyDigestService` | Arma y envía el resumen de pendientes por rol (cada supervisor con lo suyo; el revisor también con las solicitudes de plazo y reemplazo); en modo prueba solo devuelve a quién le llegaría |
| `reminderScheduleService` | Guarda los días y horas del resumen, lo reprograma sin reiniciar y permite enviarlo en el momento |
| `emailService` | Correo transaccional mediante Brevo, con plantilla institucional común (`buildEmailLayout`) |
| `pdfService` | Conversión de HTML a PDF con Puppeteer |
| `expenseSummaryService` | Control de gasto diario por moneda, exceso en hoteles y alertas; usado por empleado y revisores por igual |
| `tripExportService` | Reúne los datos de las planillas de varios viajes para exportarlas juntas a Excel |
| `userImportService` | Revisa las filas del Excel de usuarios (formato, repetidos en el archivo y en el sistema, cargos, secciones, roles únicos y jefes) y crea las válidas por niveles, primero los jefes |

### Retenciones impositivas

| Código | Tipo | Retenciones |
|---|---|---|
| `F` | Compra o servicio con factura | Ninguna; genera crédito fiscal de IVA (13 % del total) |
| `R` | Recibo: documento sin IVA | Ninguna; no lleva IVA ni crédito fiscal |
| `C` | Compra de bien sin factura | IUE 5% e IT 3% sobre la base incrementada (pagado ÷ 0.92) |
| `S` | Servicio o alquiler sin factura | RC-IVA 13% e IT 3% sobre la base incrementada (pagado ÷ 0.84) |

En la factura (`F`) el IVA es el **13 % del total** y se resta de él: subtotal = total − IVA. Al empleado se le reconoce el total, y en la planilla (PDF y Excel) el IVA va en su columna como crédito fiscal y el **importe costo/gasto es el total menos el IVA** (por ejemplo, 305.00 − 39.65 = 265.35). Con alcohol se pierde el crédito fiscal y el costo es el total. El recibo (`R`) no lleva IVA: el monto es el total pagado, sin descontar nada, y la planilla (PDF y Excel) muestra IVA 0. Al cambiar entre factura y recibo, el formulario conserva el total pagado. En los gastos sin factura la empresa asume los impuestos (**base incrementada**): el empleado registra lo que pagó; el RC-IVA 13 % (o IUE 5 %) y el IT 3 % se calculan cada uno con su porcentaje sobre lo pagado ÷ 0.84 en servicios (÷ 0.92 en compras), sin redondear esa división, y cada retención se redondea a centavos; la base es pagado + retenciones, como lo calcula contabilidad. Ejemplos de servicio: pagado 40.00 → RC-IVA 6.19, IT 1.43 y base 47.62; pagado 50.00 → RC-IVA 7.74, IT 1.79 y base 59.53. Si el gasto tiene subgastos (por ejemplo, cuatro taxis en un recibo), cada uno se calcula aparte y se suman, como en el recibo de papel: 50 + 80 + 60 + 50 dan 59.53 + 95.24 + 71.43 + 59.53 = 285.73, con RC-IVA 37.15 e IT 8.58; el recibo muestra esos importes por línea. Los redondeos usan `roundCents` (`utils/retentions.js`), que redondea bien los medios centavos (1.005 → 1.01). Lo pagado cuenta para el presupuesto; la base es el importe costo/gasto de la planilla; el recibo muestra TOTAL IMPORTE (la base), las retenciones e IMPORTE A CANCELAR (lo pagado). Las pantallas lo explican con una nota (`WithholdingFormulaNote`). Los gastos internacionales quedan exentos. Los gastos con alcohol pierden toda retención y crédito fiscal: se imputan íntegros como costo, sin importar el tipo de comprobante. Los valores se guardan al registrar como referencia, pero las pantallas, la planilla y los recibos los calculan siempre desde lo pagado (`utils/retentions.js`), así un gasto guardado con otro cálculo se muestra con el actual. Las consultas del detalle del viaje, las revisiones y las planillas devuelven los gastos ordenados por fecha y, dentro del mismo día, por orden de registro.

**Redondeo.** Todos los importes se redondean a centavos con `roundCents` (`utils/retentions.js`), que suma un épsilon antes de redondear para que los medios centavos suban (1.005 → 1.01); `toFixed` falla en esos casos por la coma flotante.

**Recibo con varios subgastos.** El recibo que emite el sistema muestra cada subgasto con su importe con retenciones, calculado por separado, y el total es la suma de las líneas:

| Subgasto | Pagado | Importe | RC-IVA 13 % | IT 3 % |
|---|---|---|---|---|
| Taxi domicilio – aeropuerto | 50.00 | 59.53 | 7.74 | 1.79 |
| Taxi aeropuerto – centro | 80.00 | 95.24 | 12.38 | 2.86 |
| Taxi centro – aeropuerto | 60.00 | 71.43 | 9.29 | 2.14 |
| Taxi aeropuerto – domicilio | 50.00 | 59.53 | 7.74 | 1.79 |
| **Total** | **240.00** | **285.73** | **37.15** | **8.58** |

Calcular sobre el total de 240 de una vez daría 285.71: por eso se calcula por línea, igual que el recibo en papel que corrige contabilidad.

### Monto del viaje

Al registrar el viaje, el monto se calcula con las tarifas del cargo del empleado: en un viaje nacional, días × tarifa en Bs; en uno internacional, el día de salida y el de regreso con la tarifa en Bs y los días intermedios con la tarifa en USD. Tesorería revisa y ajusta el monto final al asignar los fondos.

El motivo del viaje admite hasta 500 caracteres; en los asuntos de correo se acorta (`shortenText`) y en el nombre de los archivos se usan sus primeros caracteres.

### Control de gasto diario

El presupuesto se controla día por día y **por moneda**: en un viaje nacional, lo gastado en Bs cada día no puede superar el `monto_diario` del cargo; en uno internacional, cada día se controla con las dos tarifas por separado (gasto en Bs ≤ `monto_diario` y gasto en USD ≤ `monto_diario_usd`), y se puede gastar en cualquiera de las dos monedas cualquier día. Los gastos de hotel quedan fuera del control diario y se controlan contra el total asignado al viaje. Cada día excedido —y el exceso en hoteles, si corresponde— requiere una justificación (`Comentario.fecha_justificada`). Al cerrar la rendición, el saldo se calcula por moneda: si en total se gastó más Bs (o USD) que lo asignado, aparece como exceso a reembolsar en esa moneda, y lo que sobra de la otra, como saldo a devolver.

### Tipo de cambio

En los gastos internacionales pagados en otra moneda (EUR, PEN, ARS, BRL, CLP, COP, MXN), el empleado registra cada tramo con su monto y el tipo de cambio que le aplicaron; el sistema calcula el equivalente en USD. Los tramos son referencia: el monto que vale es el ingresado por el empleado.

### Gestión de plazos

Se conceden cuatro días de tolerancia tras la finalización del viaje. Vencido ese margen, el empleado debe solicitar autorización al revisor, que otorga cuatro días adicionales desde la fecha de respuesta. El plazo no corre mientras el viaje está rechazado: el empleado puede corregir sus gastos sin pedir autorización. El plazo es del viaje: la extensión vale para el titular y para su reemplazo aprobado, y cualquiera de los dos puede pedirla; la respuesta se avisa a ambos. Una solicitud que queda pendiente cuando el viaje se envía a revisión se cierra sola (estado `RECHAZADA` sin revisor, con el motivo del cierre).

La extensión amplía el margen para **cargar** los gastos, no el rango de fechas admisibles: la fecha del gasto debe seguir perteneciendo al período del viaje.

### Recibos y datos para Oracle

- **N° de recibo en papel:** un gasto sin factura puede guardar el número impreso de su recibo (`Gasto.numero_recibo`, opcional). El recibo que genera el sistema lo menciona («Recibo original Nº …») y en «Son:» escribe en letras el importe a cancelar, como el recibo en papel.
- **Número de rendición del mes:** el trigger `viaje_numero_rendicion` le da a cada viaje, al quedar `APROBADO_FINAL`, el siguiente número del mes de su último comprobante (`Viaje.numero_rendicion`, `periodo_rendicion`). El contador (`Correlativo_Rendicion`) avanza en un solo paso y un índice único impide repetir números aunque se aprueben varias rendiciones a la vez.
- **Códigos de la cuenta del gasto:** cada sección guarda su código de Oracle (`Seccion.codigo_seccion`) y cada usuario su dependencia (`Usuario.codigo_dependencia`); el Excel toma la dependencia del jefe directo del que viaja, o la suya si no tiene jefe. Ambos se validan como 3 dígitos.
- Las consultas de las planillas para Excel envían, además, el CUF de la factura, los recibos emitidos, los respaldos, el apellido materno y estos códigos.

## Extracción de datos de comprobantes

La imagen del comprobante se envía al modelo de visión de Gemini (`invoiceExtractionService`) con una instrucción que fija el contexto tributario boliviano: el «Importe» es el total con IVA incluido, el IVA es del 13 % y debe devolverse como monto en dinero, y el resultado es un JSON con proveedor, NIT, CUF (código de autorización; se guarda solo con letras y números en mayúsculas y solo en facturas, `utils/cuf.js`), número de factura, fecha de emisión, monto sin impuestos, IVA, total, tipo de documento (`F` o `R`) y detalle de productos.

La invocación (`geminiService`) reintenta ante errores temporales y, si el modelo principal falla o agotó su cuota, usa un modelo de respaldo. La respuesta se normaliza: los datos que faltan quedan como «No Especificado» y la fecha se valida (`fecha_emision_valida` indica si es una fecha real con formato válido). Al **registrar**, el empleado revisa y puede corregir todos los datos antes de guardar, incluida la fecha de emisión (por si la IA la leyó mal); al **modificar** una factura ya guardada, la fecha queda bloqueada. La cantidad de cada producto admite hasta 3 decimales (por ejemplo 53.345 litros de combustible o 6 unidades), igual que la columna `Detalle_Factura.cantidad numeric(12, 3)`; la extracción la redondea a 3 decimales y el guardado rechaza una cantidad con más. El número de factura admite códigos con símbolos (`@`, `$`, `#`), porque recibos y boletos suelen traer un código en lugar de número; la IA usa ese código cuando no hay número. En un recibo extraído, el monto es el total pagado y el IVA es 0. En una factura, el IVA es el 13 % del total y se resta de él (IVA = total × 0.13, subtotal = total − IVA); si la IA devuelve otros valores, se recalculan así, sin cambiar el total.

## Pruebas automáticas

| Tipo | Qué prueba | Comando | Carpeta |
|---|---|---|---|
| Unitarias | Funciones sueltas: retenciones (también por subgasto), validación de la importación de usuarios, IVA de factura y recibo en la planilla, cantidades con decimales, CUF, HTML del recibo, control diario por moneda, recordatorios, jerarquía | `npm test` | `tests/services/` |
| De la API | Endpoints completos contra una base de prueba: permisos, viajes, gastos en ambas monedas, tipo de cambio de los tramos, recibo sin IVA con cantidad decimal, CUF de la factura, respaldos (solo en viajes internacionales) y N° de recibo de gastos sin factura, presupuesto con lo pagado, número de rendición del mes, códigos de Oracle de secciones y usuarios, cambio de un gasto a Hoteles, exportación, importación de usuarios desde Excel | `npm run test:api` | `tests/api/` |

Las pruebas de la API necesitan una base PostgreSQL de prueba con los scripts de `database/` (`01` a `04` y `testing_02_organizacion_prueba.sql`), servida por PostgREST y el proxy `tests/support/supabaseProxy.js`, que imita la ruta `/rest/v1` de Supabase, acepta las subidas a Storage sin guardarlas y anota los archivos que se piden borrar. **No se corren contra Supabase real.**

En GitHub las pruebas se ejecutan solas en cada `push` y pull request (`.github/workflows/pruebas.yml`): una base temporal se crea y se borra en cada corrida. El resultado aparece como ✅ o ❌ junto a cada commit, en la pestaña **Actions** del repositorio. Si una prueba falla, GitHub la marca junto a la línea de código que falló (reportero `github-actions` de Jest). En las pruebas los correos no salen de verdad: se simulan y se revisa a quién se habrían mandado.

## Base de datos

Sobre PostgreSQL. Los scripts de reconstrucción están en `database/` (cuatro archivos: esquema, funciones, semillas y RLS); ver su `README.md` para el orden de ejecución y las decisiones de diseño.

Todas las marcas temporales usan `timestamptz`: el tipo sin zona horaria descartaba el huso al persistir, produciendo un desplazamiento de cuatro horas respecto de Bolivia.

### Archivos en el almacenamiento

Los comprobantes, respaldos y fotos de perfil van al bucket público `facturas` de Supabase Storage (carpetas `gastos/`, `facturas/` y `perfiles/`). Todo pasa por `storageService`, que sube con `service_role` y borra los archivos que dejan de usarse:

- al **eliminar un gasto**, su comprobante y sus respaldos;
- al **editar** un gasto o una factura, el comprobante reemplazado o quitado y los respaldos quitados;
- al cambiar o quitar la **foto de perfil**, la anterior, y al eliminar un usuario, la suya;
- si al **guardar** algo falla después de subir los archivos, los recién subidos.

Si falla el borrado de un archivo solo se avisa en el registro, sin cortar la operación. Para limpiar los archivos que quedaron sueltos de antes:

```bash
npm run limpiar-archivos -- --prueba   # lista los archivos que ningún gasto ni usuario usa
npm run limpiar-archivos               # los borra (deja los de menos de un día)
```

El bucket es público, así que las imágenes se ven por su URL sin políticas sobre `storage.objects`; el backend usa `service_role` y tampoco las necesita. Si Supabase avisa «Clients can list all files in this bucket», hay que borrar las políticas de ese bucket (en *Storage > Policies* o con SQL).

## Dependencias y seguridad

`npm audit` no reporta vulnerabilidades. Puppeteer se actualizó de la versión 10 a la 25 (la 10 arrastraba dependencias vulnerables); los PDF se compararon antes y después con los mismos datos y salen iguales (el A4 ahora es exacto: 841.92 en lugar de 842.88 puntos). No hace falta `npm audit fix --force`.

## Convenciones

Ver `reglas.md` en la raíz del repositorio.

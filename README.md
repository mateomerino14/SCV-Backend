# SCV Backend

Sistema de Control de Viaticos (SCV) - API REST construida con Node.js, Express y Supabase (PostgreSQL). Maneja todo el flujo de solicitud, aprobacion, ejecucion y rendicion de viajes de la empresa: desde que un empleado crea el viaje hasta que Tesoreria aprueba el fondo, se registran los gastos, y Revisor da la aprobacion final.

## Stack tecnico

- **Runtime:** Node.js
- **Framework:** Express 5
- **Base de datos:** Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Autenticacion:** JWT (access token + refresh token en cookie httpOnly)
- **Passwords:** bcrypt
- **Correo:** Brevo (`@getbrevo/brevo` / `sib-api-v3-sdk`)
- **PDFs:** html-pdf-node (generacion de recibos, memos y rendiciones)
- **OCR / IA:** OCR.space + Groq (extraccion automatica de datos de facturas)
- **Testing:** Jest + Supertest

## Arquitectura

El proyecto sigue una separacion simple de tres capas, sin sobre-ingenieria (no se uso arquitectura hexagonal ni patrones con capas de abstraccion innecesarias, ya que el tamano del proyecto no lo justifica):

```
Route -> Controller -> Service (solo cuando hay logica de negocio real) -> Supabase / APIs externas
```

- **routes/**: define los endpoints, conecta metodo HTTP + path + middlewares con la funcion del controller correspondiente. No contiene logica propia.
- **controllers/**: recibe la peticion HTTP (`req`), valida lo minimo necesario, llama al service (o a Supabase directo si es un CRUD simple) y arma la respuesta (`res`).
- **services/**: contiene la logica de negocio real (calculos, generacion de documentos, envio de correos, validaciones complejas, orquestacion de varias tablas). Los CRUD triviales (sin logica de negocio) no tienen service propio, el controller llama a Supabase directamente.
- **middlewares/**: autenticacion JWT, verificacion de roles y verificacion de cargo especifico (tesoreria).
- **config/**: inicializacion del cliente de Supabase.
- **utils/**: funciones puras reutilizables sin dependencias externas (normalizar texto, convertir numeros a letras, lista de palabras prohibidas).

## Convenciones de codigo

- Todo el codigo (variables, funciones, nombres de archivo, nombres de rutas HTTP) esta en ingles.
- El texto que ve el usuario final (mensajes de error, contenido de correos, PDFs) esta en espanol.
- Las columnas de las tablas de Supabase se mantienen en espanol (son el nombre real de la columna en la base de datos), solo se usan como key literal dentro de `.select()`, `.insert()`, `.update()`, `.eq()`, etc. Las variables que reciben esos valores si estan en ingles.
- Sin comentarios dentro del cuerpo de las funciones, solo una linea de comentario en espanol antes de cada funcion describiendo que hace.
- Sin operadores ternarios, siempre `if / else` completo con llaves.
- `else` y `catch` van en linea nueva, no pegados al cierre de llave anterior.

## Estructura de carpetas

Los controllers, routes y services estan agrupados por modulo (feature), para que sea facil ubicar todo lo relacionado a un dominio especifico:

```
src/
  app.js                 -> configura Express, monta todas las rutas (sin escuchar puerto)
  index.js                -> levanta el servidor, importa app.js
  config/
    supabase.js
  middlewares/
    auth.js                -> valida JWT y que el usuario este activo
    roleAuth.js             -> valida que el usuario tenga alguno de los roles permitidos
    treasurerPosition.js    -> valida que el usuario tenga el cargo de tesoreria
  utils/
    textNormalizer.js       -> normaliza texto (quita acentos, minusculas)
    numberToWords.js        -> convierte numeros a su representacion en letras
    forbiddenWords.js       -> lista de palabras prohibidas para moderacion de comentarios
  routes/
    catalog/                -> role, tax, expenseCategory, position, audit
    user/                   -> user, auth
    trip/                   -> trip
    expense/                -> expense, invoice, invoiceDetail, image, supplier, comment
    approval/                -> review, reviewer, approver, treasurer, deadlineAuthorization
    admin/                   -> admin
  controllers/
    catalog/
    user/
    trip/
    expense/
    approval/
    admin/
  services/
    shared/                  -> emailService, pdfService, deadlineService, alcoholDetectionService, commentModerationService
    catalog/                 -> positionService
    user/                    -> userService, userDirectoryService, tokenService
    trip/                    -> tripService, tripCommentService
    expense/                 -> expenseService, receiptService, supplierService, invoiceService, invoiceExtractionService
    approval/                -> approverService, approvalMemoService, deadlineAuthorizationService, reviewService, expenseSummaryService, reviewerService, finalReviewDocumentService, treasurerService, treasuryDocumentService
tests/
  app.test.js               -> tests de integracion basicos (health check y proteccion de rutas)
  services/                  -> tests unitarios de servicios puros (sin Supabase)
```

## Modulos (features)

### catalog
Datos de catalogo usados por el resto del sistema: roles, impuestos, categorias de gasto, cargos y registros de auditoria. Mayormente CRUD simple, salvo `position` que valida cargos duplicados.

### user
Gestion de usuarios (perfil propio, administracion de usuarios, activar/suspender) y autenticacion (login, refresh token, verificacion de correo por codigo de 7 digitos).

### trip
El ciclo de vida completo de un viaje: creacion en borrador, edicion, envio a revision, dashboard del empleado, historial paginado, confirmacion de finalizacion.

### expense
Todo lo relacionado a gastos individuales: registro de gastos con o sin factura (incluye calculo automatico de retenciones IVA/IUE/IT segun tipo de gasto), extraccion automatica de datos de facturas (QR del SIAT, OCR + IA como respaldo), generacion de recibos en PDF (agrupados e individuales), proveedores, imagenes y comentarios.

### approval
El flujo de aprobacion en cascada de un viaje, con cinco roles distintos que participan en etapas diferentes:

1. **Supervisor (review)**: aprueba el viaje antes de iniciar (revision previa) y aprueba los gastos al finalizar (revision de gastos).
2. **Aprobador (approver)**: aprueba el viaje despues del supervisor, genera y envia el memorandum de aprobacion.
3. **Tesorero (treasurer)**: asigna y aprueba el fondo del viaje, confirma al empleado que puede empezar a registrar gastos.
4. **Revisor (reviewer)**: da la aprobacion final de la rendicion de gastos, genera el documento de rendicion para tesoreria y el resultado final para el empleado.
5. **Autorizacion de plazo (deadlineAuthorization)**: permite a un empleado solicitar una extension cuando se vencio el plazo de tolerancia para seguir registrando gastos, y a un revisor aprobar o rechazar esa solicitud.

Todos comparten la misma logica base para el resumen de gastos (`expenseSummaryService`) y el manejo de comentarios/observaciones sobre un viaje (`tripCommentService`), evitando duplicar codigo entre los distintos roles.

### admin
Panel de estadisticas generales del sistema (usuarios, cargos, viajes por estado) para el rol Administrador.

## Seguridad

- Autenticacion con JWT (access token de corta duracion + refresh token en cookie httpOnly, con invalidacion forzada al cambiar rol o suspender usuario).
- Passwords con bcrypt, con expiracion de contrasenia a los 90 dias.
- Middlewares de autorizacion por rol (`roleAuth`) y por cargo especifico (`treasurerPosition`).
- Moderacion automatica de comentarios contra lista de palabras prohibidas.
- Validacion de HTML escapado en la generacion de PDFs para evitar inyeccion.
- Dependencias auditadas con `npm audit`. Las vulnerabilidades restantes estan documentadas y ligadas casi en su totalidad a una version antigua de `html-pdf-node` (pendiente de reemplazo por una alternativa mantenida).

## Testing

```
npm test
```

Corre con Jest. Incluye:
- Tests de integracion (`tests/app.test.js`): levantan la app completa via Supertest y verifican comportamiento HTTP real (rutas protegidas devuelven 401 sin token, etc).
- Tests unitarios (`tests/services/`): cubren los servicios de logica pura que no dependen de Supabase (normalizacion de texto, conversion de numeros a letras, moderacion de comentarios, calculo de resumen de gastos, deteccion de tipo de documento fiscal).

## Variables de entorno requeridas

Ver `.env.example` para el detalle completo con comentarios. Resumen:

```
PORT
SUPABASE_URL
SUPABASE_KEY
JWT_SECRET
JWT_REFRESH_SECRET
BREVO_API_KEY
ABSTRACT_EMAIL_API_KEY
GROQ_API_KEY
OCR_SPACE_API_KEY
GMAIL_USER
GMAIL_PASS
NODE_ENV
```

Nota: `GMAIL_USER` y `GMAIL_PASS` no se encontraron referenciadas en ningun archivo del codigo actual (el envio de correo lo maneja `emailService.js` via Brevo). Es posible que sean variables de una integracion anterior que ya no se usa, valdria la pena confirmar antes de eliminarlas.

## Scripts

```
npm run dev      -> corre con nodemon (desarrollo)
npm start        -> corre el servidor (produccion)
npm test         -> corre la suite de tests con Jest
```
# Sistema de Control de Viáticos — Backend

API REST del sistema de gestión de viajes corporativos y rendición de gastos de MAXAM.

## Requisitos

- Node.js 18 o superior
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
| `TRUST_PROXY` | Opcional. `true` si el servidor está detrás de un proxy (en Render no hace falta: se detecta solo con la variable `RENDER`) |
| `PUPPETEER_EXECUTABLE_PATH` | Opcional. Ruta a un Chrome/Chromium propio si no se usa el que descarga `puppeteer` al instalar |

En Render el servidor confía en el proxy de la plataforma (`trust proxy`) para leer la IP real de cada usuario; así el límite de intentos de ingreso se aplica por persona y no a todos juntos.

## Ejecución

```bash
npm run dev    # con recarga automática (nodemon)
npm start      # producción
```

Al arrancar, se programa además una tarea (`node-cron`) que envía un resumen de pendientes a supervisores, aprobadores, revisor y tesorero tres veces al día (08:00, 12:00 y 16:00, hora Bolivia), solo a quienes tengan algo pendiente. Cada supervisor recibe solo sus propios pendientes: los que tiene asignados y los sin asignar que le corresponden por jerarquía.

## Stack

| Tecnología | Propósito |
|---|---|
| Express | Enrutamiento y middlewares HTTP |
| Supabase JS | Acceso a la base de datos y al almacenamiento |
| jsonwebtoken | Emisión y verificación de tokens |
| bcrypt | Cifrado de contraseñas |
| Multer | Procesamiento de archivos multiparte |
| Jimp + qrcode-reader | Lectura de códigos QR en comprobantes |
| Cheerio + Axios | Consulta y análisis del portal del SIAT |
| Google Generative AI | Extracción de datos de comprobantes y detección de alcohol |
| Puppeteer | Generación de PDF (memorándum, confirmación de fondos, rendición, planilla y recibos) |
| node-cron | Resumen de pendientes por correo, tres veces al día |
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
│   │                          tripCommentService, tripStatementService
│   ├── user/                  tokenService, userService, userDirectoryService
│   └── shared/                alcoholDetectionService, auditLogService,
│                              commentModerationService, dailyDigestService,
│                              deadlineService, emailService, geminiService,
│                              hierarchyAssignmentService, pdfService
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
│   ├── textNormalizer.js     Normalización para comparaciones
│   └── tripCode.js           Código legible de cada viaje
├── app.js                    Configuración de Express
└── index.js                  Arranque del servidor y del cron de resúmenes

database/                     Scripts SQL del esquema (ver su README.md)
```

## Rutas

| Prefijo | Archivo | Alcance |
|---|---|---|
| `/auth` | `user/auth.js` | Inicio y cierre de sesión, renovación, recuperación por código |
| `/user` | `user/user.js` | Perfil, cambio de contraseña y gestión de usuarios |
| `/trip` | `trip/trip.js` | Ciclo de vida del viaje y planilla en PDF |
| `/expense` | `expense/expense.js` | Gastos y recibos |
| `/invoice` | `expense/invoice.js` | Extracción y registro de facturas |
| `/supplier` | `expense/supplier.js` | Proveedores (solo administrador) |
| `/review` | `approval/review.js` | Revisión previa y de gastos del supervisor |
| `/approver` | `approval/approver.js` | Aprobación del viaje y revisión adicional por alcohol |
| `/treasurer` | `approval/treasurer.js` | Asignación de fondos |
| `/reviewer` | `approval/reviewer.js` | Revisión final |
| `/deadline-authorization` | `approval/deadlineAuthorization.js` | Extensiones de plazo |
| `/substitution` | `approval/substitution.js` | Rendición por terceros |
| `/role`, `/position`, `/section`, `/expense-category`, `/tax`, `/audit` | `catalog/` | Catálogos e historial de accesos |
| `/admin` | `admin/admin.js` | Resumen general del administrador |

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
- **Ingreso**: mismo mensaje si el correo no existe o la clave es incorrecta. Límite de 10 intentos fallidos cada 15 minutos por IP; los ingresos correctos no cuentan. Cada código de recuperación se anula tras 5 intentos fallidos.
- **Concurrencia**: aprobar, rechazar, tomar, devolver, enviar y resolver solicitudes exigen el estado esperado al escribir. Si otra persona se adelantó, se responde 409 y no se duplican correos ni registros.
- **Documentos**: todo texto escrito por usuarios se escapa antes de insertarse en correos y PDF (`htmlEscape`); los PDF se generan con JavaScript desactivado y el navegador se cierra siempre.
- **Administración de usuarios**: solo se aceptan los campos del formulario y nunca se devuelve el hash de la contraseña.
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

Un empleado puede solicitar que otra persona rinda los gastos de su viaje en su nombre (`substitutionService`). El revisor aprueba o rechaza la solicitud; un viaje tiene a lo sumo una sustitución aprobada. El titular conserva siempre el acceso a su viaje (puede seguir registrando gastos y confirmar la finalización); si el sustituto es dado de baja, simplemente ya no puede ingresar y el viaje sigue en manos del titular. El viaje aparece en el dashboard del sustituto etiquetado con el nombre del titular, pero los documentos (memorándum, recibos, planilla) siempre conservan el nombre del titular original, ya que se generan a partir de `Viaje.id_usuario`, que nunca cambia.

## Servicios transversales

| Servicio | Responsabilidad |
|---|---|
| `hierarchyAssignmentService` | Resuelve quién revisa cada etapa (jefe directo, sección o roles únicos) |
| `deadlineService` | Valida la fecha del gasto contra el período del viaje y el plazo de carga, considerando extensiones; no bloquea las correcciones de un rechazo |
| `alcoholDetectionService` | Detecta bebidas alcohólicas en los productos facturados o en la descripción del gasto, por gasto y agregado por viaje |
| `geminiService` | Llamadas al modelo con reintentos y modelo de respaldo ante cuota agotada |
| `commentModerationService` | Verifica que el texto no contenga términos prohibidos |
| `auditLogService` | Registra ingresos, salidas y cambios de contraseña |
| `dailyDigestService` | Arma y envía el resumen de pendientes por rol, tres veces al día |
| `emailService` | Correo transaccional mediante Brevo, con plantilla institucional común (`buildEmailLayout`) |
| `pdfService` | Conversión de HTML a PDF con Puppeteer |
| `expenseSummaryService` | Control de gasto diario, exceso en hoteles y alertas; usado por empleado y revisores por igual |

### Retenciones impositivas

| Código | Tipo | Retenciones |
|---|---|---|
| `F` | Compra o servicio con factura | Ninguna; genera crédito fiscal de IVA |
| `R` | Documento sin IVA | Ninguna |
| `C` | Compra de bien sin factura | IUE 5% e IT 3% sobre base incrementada |
| `S` | Servicio o alquiler sin factura | RC-IVA 13% e IT 3% sobre base incrementada |

Los gastos internacionales quedan exentos. Los gastos con alcohol pierden toda retención y crédito fiscal: se imputan íntegros como costo, sin importar el tipo de comprobante. Los valores se calculan al registrar y se persisten, de modo que los reportes históricos no varíen ante cambios de alícuota.

### Control de gasto diario

El presupuesto se controla día por día, no contra el total del viaje: cada día no puede superar el `monto_diario` (o `monto_diario_usd` en los días intermedios de un viaje internacional) del cargo del empleado, sin discriminar por categoría. Los gastos de hotel quedan excluidos de este control diario y se controlan en cambio contra el total asignado al viaje. Cada día excedido —y el exceso en hoteles, si corresponde— requiere su propia justificación (`Comentario.fecha_justificada`).

### Gestión de plazos

Se conceden cuatro días de tolerancia tras la finalización del viaje. Vencido ese margen, el empleado debe solicitar autorización al revisor, que otorga cuatro días adicionales desde la fecha de respuesta. El plazo no corre mientras el viaje está rechazado: el empleado puede corregir sus gastos sin pedir autorización.

La extensión amplía el margen para **cargar** los gastos, no el rango de fechas admisibles: la fecha del gasto debe seguir perteneciendo al período del viaje.

## Extracción de datos de comprobantes

Estrategia en cascada, de mayor a menor confiabilidad:

1. Lectura del código QR de la imagen.
2. Si apunta al SIAT, consulta directa a la autoridad tributaria. Produce datos verificados con detalle de productos.
3. Si el QR es genérico, se interpretan sus parámetros.
4. Como última instancia, análisis de la imagen por el modelo de visión.

La invocación al modelo (`geminiService`) reintenta ante errores temporales y, si el modelo principal falla o agotó su cuota, usa un modelo de respaldo. Si la fecha de emisión extraída no tiene un formato válido, el campo queda editable en el frontend para que el empleado la corrija; si vino bien formada, queda bloqueado.

## Base de datos

Sobre PostgreSQL. Los scripts de reconstrucción están en `database/` (cuatro archivos: esquema, funciones, semillas y RLS); ver su `README.md` para el orden de ejecución y las decisiones de diseño.

Todas las marcas temporales usan `timestamptz`: el tipo sin zona horaria descartaba el huso al persistir, produciendo un desplazamiento de cuatro horas respecto de Bolivia.

## Convenciones

Ver `reglas.md` en la raíz del repositorio.

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

## Ejecución

```bash
npm run dev    # con recarga automática (nodemon)
npm start      # producción
```

Al arrancar, se programa además una tarea (`node-cron`) que envía un resumen de pendientes a supervisores, aprobadores, revisor y tesorero tres veces al día (08:00, 12:00 y 16:00, hora Bolivia), solo a quienes tengan algo pendiente.

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
| html-pdf-node | Generación de recibos y planilla en PDF |
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
│   ├── admin/                admin
│   ├── approval/              review, reviewer, approver, treasurer,
│   │                          deadlineAuthorization, substitution
│   ├── catalog/               role, position, expenseCategory, tax, audit
│   ├── expense/               expense, invoice, invoiceDetail,
│   │                          image, supplier, comment
│   ├── trip/                  trip
│   └── user/                  user, auth
├── controllers/              Misma división que routes
├── services/
│   ├── approval/               reviewService, reviewerService,
│   │                           approverService, approverAlcoholReviewService,
│   │                           treasurerService, deadlineAuthorizationService,
│   │                           substitutionService, expenseSummaryService,
│   │                           approvalMemoService, finalReviewDocumentService,
│   │                           treasuryDocumentService
│   ├── expense/                expenseService, invoiceService,
│   │                           invoiceExtractionService,
│   │                           receiptService, supplierService
│   ├── trip/                   tripService, tripCommentService,
│   │                           tripStatementService
│   ├── user/                   Autenticación y gestión de usuarios
│   ├── admin/                  Métricas del panel
│   └── shared/                 alcoholDetectionService,
│                               commentModerationService,
│                               dependencyAssignmentService,
│                               dailyDigestService, deadlineService,
│                               emailService, pdfService
├── middlewares/
│   ├── auth.js                     Verificación del token
│   ├── roleAuth.js                 Autorización por rol
│   ├── loginRateLimiter.js         Límite de intentos de inicio de sesión
│   ├── passwordResetRateLimiter.js Límite de envío/verificación de código de recuperación
│   ├── invoiceExtractRateLimiter.js Límite de extracciones de factura por usuario
│   └── treasurerPosition.js        Restricción por cargo
├── utils/
│   ├── forbiddenWords.js     Catálogo de términos vedados
│   ├── numberToWords.js      Importes en letras
│   └── textNormalizer.js     Normalización para comparaciones
├── app.js                    Configuración de Express
└── index.js                  Arranque del servidor y del cron de resumenes

database/                     Scripts SQL del esquema (ver su README.md)
```

## Rutas

| Prefijo | Archivo | Alcance |
|---|---|---|
| `/auth` | `user/auth.js` | Inicio de sesión y recuperación |
| `/user` | `user/user.js` | Perfil y gestión de usuarios |
| `/trip` | `trip/trip.js` | Ciclo de vida del viaje, planilla en PDF |
| `/expense` | `expense/expense.js` | Gastos y recibos |
| `/invoice` | `expense/invoice.js` | Extracción y registro de facturas |
| `/invoice-detail` | `expense/invoiceDetail.js` | Detalle de productos |
| `/image` | `expense/image.js` | Comprobantes adjuntos |
| `/supplier` | `expense/supplier.js` | Proveedores |
| `/comment` | `expense/comment.js` | Comentarios |
| `/review` | `approval/review.js` | Revisión previa y de gastos del supervisor |
| `/reviewer` | `approval/reviewer.js` | Revisión final |
| `/approver` | `approval/approver.js` | Aprobación del viaje y revisión adicional por alcohol |
| `/treasurer` | `approval/treasurer.js` | Asignación de fondos |
| `/deadline-authorization` | `approval/deadlineAuthorization.js` | Extensiones de plazo |
| `/substitution` | `approval/substitution.js` | Rendición por terceros |
| `/role`, `/position`, `/expense-category`, `/tax`, `/audit` | `catalog/` | Entidades maestras |
| `/admin` | `admin/admin.js` | Panel administrativo |

## Autorización

El middleware `roleAuth` recibe los roles habilitados y se declara en cada ruta, haciendo visible la restricción sin inspeccionar el controlador.

```javascript
router.post('/expense-review/:tripId/take',
  authMiddleware,
  roleMiddleware(['SUPERVISOR']),
  reviewController.takeExpenseReview)
```

El perfil de **Tesorero** no es un rol del sistema sino un cargo dentro de la organización; su verificación usa `treasurerPosition`, que contrasta el puesto asignado al usuario.

Los viajes pendientes se muestran solo a los supervisores y aprobadores que comparten `numero_dependencia` con el empleado (`dependencyAssignmentService`); si ninguno de esa dependencia existe, el viaje se muestra a todos para que no quede sin asignar. No aplica a tesorero ni revisor.

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

El rechazo conduce a `RECHAZADO` e incrementa `ciclo_revision`. Solo las observaciones del ciclo vigente se consideran para validar un nuevo rechazo; el sistema exige al menos una antes de permitirlo. Esta regla se aplica de forma idéntica en las 6 instancias de rechazo del sistema (supervisor ×2, aprobador, aprobador por alcohol, revisor).

La asignación de un viaje verifica que el campo de revisor asignado esté vacío antes de establecerlo, evitando que dos usuarios tomen la misma solicitud.

### Rendición por terceros

Un empleado puede solicitar que otra persona rinda los gastos de su viaje en su nombre (`substitutionService`). El revisor aprueba o rechaza la solicitud; pueden coexistir varias sustituciones activas en el sistema. El viaje aparece en el dashboard del sustituto etiquetado con el nombre del titular, pero los documentos (memorándum, recibos, planilla) siempre conservan el nombre del titular original, ya que se generan a partir de `Viaje.id_usuario`, que nunca cambia.

## Servicios transversales

| Servicio | Responsabilidad |
|---|---|
| `deadlineService` | Valida la fecha del gasto contra el período del viaje y el plazo de carga, considerando extensiones vigentes |
| `alcoholDetectionService` | Detecta bebidas alcohólicas en los productos facturados o en la descripción libre del gasto, a nivel de gasto individual y agregado por viaje |
| `commentModerationService` | Verifica que el texto no contenga términos prohibidos |
| `dependencyAssignmentService` | Filtra la asignación de viajes por dependencia organizacional |
| `dailyDigestService` | Arma y envía el resumen de pendientes por rol, tres veces al día |
| `emailService` | Correo transaccional mediante Brevo, con plantilla institucional común (`buildEmailLayout`) |
| `pdfService` | Conversión de HTML a PDF mediante `html-pdf-node`, consumida por recibos, planilla y memorándum |
| `expenseSummaryService` | Calcula el control de gasto diario, el exceso contra el total (hoteles), y las alertas; consumido por la vista del empleado, supervisor, aprobador (revisión por alcohol) y revisor por igual |

### Retenciones impositivas

| Código | Tipo | Retenciones |
|---|---|---|
| `F` | Compra o servicio con factura | Ninguna; genera crédito fiscal de IVA |
| `R` | Documento sin IVA | Ninguna |
| `C` | Compra de bien sin factura | IUE 5% e IT 3% sobre base incrementada |
| `A` | Servicio o alquiler sin factura | RC-IVA 13% e IT 3% sobre base incrementada |

Los gastos internacionales quedan exentos. Los gastos con alcohol pierden toda retención y crédito fiscal: se imputan íntegros como costo, sin importar el tipo de comprobante. Los valores se calculan al registrar y se persisten, de modo que los reportes históricos no varíen ante cambios de alícuota.

### Control de gasto diario

El presupuesto se controla día por día, no contra el total del viaje: cada día no puede superar el `monto_diario` (o `monto_diario_usd` en los días intermedios de un viaje internacional) del cargo del empleado, sin discriminar por categoría. Los gastos de hotel quedan excluidos de este control diario y se controlan en cambio contra el total asignado al viaje. Cada día excedido —y el exceso en hoteles, si corresponde— requiere su propia justificación (`Comentario.fecha_justificada`).

### Gestión de plazos

Se conceden cuatro días de tolerancia tras la finalización del viaje. Vencido ese margen, el empleado debe solicitar autorización al revisor, que otorga cuatro días adicionales desde la fecha de respuesta.

La extensión amplía el margen para **cargar** los gastos, no el rango de fechas admisibles: la fecha del gasto debe seguir perteneciendo al período del viaje.

## Extracción de datos de comprobantes

Estrategia en cascada, de mayor a menor confiabilidad:

1. Lectura del código QR de la imagen.
2. Si apunta al SIAT, consulta directa a la autoridad tributaria. Produce datos verificados con detalle de productos.
3. Si el QR es genérico, se interpretan sus parámetros.
4. Como última instancia, análisis de la imagen por el modelo de visión.

La invocación al modelo incorpora reintentos con espera incremental. Si la fecha de emisión extraída no tiene un formato válido, el campo queda editable en el frontend para que el empleado la corrija; si vino bien formada, queda bloqueado.

## Base de datos

Sobre PostgreSQL. Los scripts de reconstrucción están en `database/`; ver su `README.md` para el orden de ejecución, las migraciones incrementales y las decisiones de diseño.

Todas las marcas temporales usan `timestamptz`: el tipo sin zona horaria descartaba el huso al persistir, produciendo un desplazamiento de cuatro horas respecto de Bolivia.

## Convenciones

Ver `reglas.md` en la raíz del repositorio.

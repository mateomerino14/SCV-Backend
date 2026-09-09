# Sistema de Control de Viáticos — Backend

API REST del sistema de gestión de viajes corporativos y rendición de gastos de MAXAM.

## Requisitos

- Node.js 18 o superior
- Un proyecto de Supabase con el esquema aplicado (ver `src/database/README.md`)

## Instalación

```bash
npm install
```

Crear un archivo `.env` en la raíz del proyecto:

```
PORT=5000
SUPABASE_URL=...
SUPABASE_KEY=...
JWT_SECRET=...
GEMINI_API_KEY=...
BREVO_API_KEY=...
ABSTRACT_EMAIL_API_KEY=...
```

| Variable | Propósito |
|---|---|
| `SUPABASE_URL` | Punto de acceso al proyecto de base de datos |
| `SUPABASE_KEY` | Clave de servicio para el acceso a los datos |
| `JWT_SECRET` | Clave de firma de los tokens de sesión |
| `GEMINI_API_KEY` | Extracción de comprobantes y moderación de contenido |
| `BREVO_API_KEY` | Envío de correo transaccional |
| `ABSTRACT_EMAIL_API_KEY` | Validación de existencia de direcciones de correo |

## Ejecución

```bash
npm run dev    # con recarga automática (nodemon)
npm start      # producción
```

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
| Google Generative AI | Extracción de datos y moderación |
| Brevo | Correo transaccional |
| Helmet + CORS | Cabeceras de seguridad y control de orígenes |

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
│   ├── admin/               admin
│   ├── approval/            review, reviewer, approver,
│   │                        treasurer, deadlineAuthorization
│   ├── catalog/             role, position, expenseCategory, tax, audit
│   ├── expense/             expense, invoice, invoiceDetail,
│   │                        image, supplier, comment
│   ├── trip/                trip
│   └── user/                user, auth
├── controllers/             Misma división que routes
├── services/
│   ├── approval/            reviewService, reviewerService,
│   │                        approverService, treasurerService,
│   │                        deadlineAuthorizationService,
│   │                        expenseSummaryService
│   ├── expense/             expenseService, invoiceService,
│   │                        invoiceExtractionService,
│   │                        receiptService, supplierService
│   ├── trip/                tripService, tripCommentService
│   ├── user/                Autenticación y gestión de usuarios
│   ├── admin/               Métricas del panel
│   └── shared/              alcoholDetectionService,
│                            commentModerationService,
│                            deadlineService, emailService, pdfService
├── middlewares/
│   ├── auth.js              Verificación del token
│   ├── roleAuth.js          Autorización por rol
│   ├── loginRateLimiter.js  Límite de intentos de acceso
│   └── treasurerPosition.js Restricción por cargo
├── utils/
│   ├── forbiddenWords.js    Catálogo de términos vedados
│   ├── numberToWords.js     Importes en letras
│   └── textNormalizer.js    Normalización para comparaciones
├── database/                Scripts SQL del esquema
├── app.js                   Configuración de Express
└── index.js                 Arranque del servidor
```

## Rutas

| Prefijo | Archivo | Alcance |
|---|---|---|
| `/auth` | `user/auth.js` | Inicio de sesión y recuperación |
| `/user` | `user/user.js` | Perfil y gestión de usuarios |
| `/trip` | `trip/trip.js` | Ciclo de vida del viaje |
| `/expense` | `expense/expense.js` | Gastos y recibos |
| `/invoice` | `expense/invoice.js` | Extracción y registro de facturas |
| `/invoice-detail` | `expense/invoiceDetail.js` | Detalle de productos |
| `/image` | `expense/image.js` | Comprobantes adjuntos |
| `/supplier` | `expense/supplier.js` | Proveedores |
| `/comment` | `expense/comment.js` | Comentarios |
| `/review` | `approval/review.js` | Ambos flujos del supervisor |
| `/reviewer` | `approval/reviewer.js` | Revisión final |
| `/approver` | `approval/approver.js` | Aprobación del viaje |
| `/treasurer` | `approval/treasurer.js` | Asignación de fondos |
| `/deadline-authorization` | `approval/deadlineAuthorization.js` | Extensiones de plazo |
| `/role`, `/position`, `/expense-category`, `/tax`, `/audit` | `catalog/` | Entidades maestras |
| `/admin` | `admin/admin.js` | Panel administrativo |

El archivo `review.js` diferencia los dos flujos por el segmento inicial: `trip-review` para la aprobación previa y `expense-review` para la rendición. Ambos replican la misma estructura de operaciones (bandejas, asignación, devolución, detalle, aprobación, rechazo y comentarios).

## Autorización

El middleware `roleAuth` recibe los roles habilitados y se declara en cada ruta, haciendo visible la restricción sin inspeccionar el controlador.

```javascript
router.post('/expense-review/:tripId/take',
  authMiddleware,
  roleMiddleware(['SUPERVISOR']),
  reviewController.takeExpenseReview)
```

El perfil de **Tesorero** no es un rol del sistema sino un cargo dentro de la organización; su verificación usa `treasurerPosition`, que contrasta el puesto asignado al usuario.

## Flujos de aprobación

### Primer flujo — autorización del viaje

```
BORRADOR → EN_REVISION_VIAJE → APROBADO_VIAJE → EN_REVISION_TESORERO → EN_CURSO
```

### Segundo flujo — rendición de gastos

```
EN_CURSO → EN_REVISION → APROBADO_SUPERVISOR → APROBADO_FINAL
```

El rechazo conduce a `RECHAZADO` e incrementa `ciclo_revision`. Solo las observaciones del ciclo vigente se consideran para validar un nuevo rechazo; el sistema exige al menos una antes de permitirlo.

La asignación de un viaje verifica que el campo de revisor asignado esté vacío antes de establecerlo, evitando que dos usuarios tomen la misma solicitud.

## Servicios transversales

| Servicio | Responsabilidad |
|---|---|
| `deadlineService` | Valida la fecha del gasto contra el período del viaje y el plazo de carga, considerando extensiones vigentes |
| `alcoholDetectionService` | Detecta bebidas alcohólicas en los productos facturados; expone también la moderación de comentarios |
| `commentModerationService` | Verifica que el texto no contenga términos prohibidos |
| `emailService` | Correo transaccional mediante Brevo, con plantilla institucional común |
| `pdfService` | Genera los recibos y documentos oficiales |
| `expenseSummaryService` | Calcula acumulados, excesos y alertas; consumido por supervisor y revisor por igual |

### Retenciones impositivas

| Código | Tipo | Retenciones |
|---|---|---|
| `F` | Compra o servicio con factura | Ninguna; genera crédito fiscal de IVA |
| `R` | Documento sin IVA | Ninguna |
| `C` | Compra de bien sin factura | IUE 5% e IT 3% sobre base incrementada |
| `A` | Servicio o alquiler sin factura | RC-IVA 13% e IT 3% sobre base incrementada |

Los gastos internacionales quedan exentos. Los valores se calculan al registrar y se persisten, de modo que los reportes históricos no varíen ante cambios de alícuota.

### Gestión de plazos

Se conceden cuatro días de tolerancia tras la finalización del viaje. Vencido ese margen, el empleado debe solicitar autorización al revisor, que otorga cuatro días adicionales desde la fecha de respuesta.

La extensión amplía el margen para **cargar** los gastos, no el rango de fechas admisibles: la fecha del gasto debe seguir perteneciendo al período del viaje.

## Extracción de datos de comprobantes

Estrategia en cascada, de mayor a menor confiabilidad:

1. Lectura del código QR de la imagen.
2. Si apunta al SIAT, consulta directa a la autoridad tributaria. Produce datos verificados con detalle de productos.
3. Si el QR es genérico, se interpretan sus parámetros.
4. Como última instancia, análisis de la imagen por el modelo de visión.

La invocación al modelo incorpora reintentos con espera incremental. El indicador `extraido_por_qr` acompaña al resultado para que el cliente señale el origen de los datos.

## Base de datos

19 tablas sobre PostgreSQL. Los scripts de reconstrucción están en `src/database/`; ver su `README.md` para el orden de ejecución y las decisiones de diseño.

Todas las marcas temporales usan `timestamptz`: el tipo sin zona horaria descartaba el huso al persistir, produciendo un desplazamiento de cuatro horas respecto de Bolivia.

## Convenciones

Ver `reglas.md` en la raíz del repositorio.
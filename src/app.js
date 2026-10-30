const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const app = express();

// Confia en el proxy de Render para leer la IP real en el limite de intentos
if (process.env.RENDER === 'true' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(helmet());

// Dominios del cliente web permitidos (CORS_ORIGINS, separados por coma)
const defaultOrigins = [
  'http://localhost:5173',
  'https://scv-frontend.vercel.app',
  'https://scv-frontend-git-develop-mat13.vercel.app',
];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

let allowedOrigins = defaultOrigins;
if (configuredOrigins.length > 0) {
  allowedOrigins = configuredOrigins;
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
// El limite alcanza para importar hasta 500 usuarios desde Excel
app.use(express.json({limit: '1mb'}));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const roleRoute = require('./routes/catalog/role');
const taxRoute = require('./routes/catalog/tax');
const expenseCategoryRoute = require('./routes/catalog/expenseCategory');
const positionRoute = require('./routes/catalog/position');
const sectionRoute = require('./routes/catalog/section');
const vehicleRoute = require('./routes/catalog/vehicle');
const documentRoute = require('./routes/document/document');
const auditRoute = require('./routes/catalog/audit');
const userRoute = require('./routes/user/user');
const authRoute = require('./routes/user/auth');
const tripRoute = require('./routes/trip/trip');
const expenseRoute = require('./routes/expense/expense');
const invoiceRoute = require('./routes/expense/invoice');
const supplierRoute = require('./routes/expense/supplier');
const reviewRoute = require('./routes/approval/review');
const reviewerRoute = require('./routes/approval/reviewer');
const approverRoute = require('./routes/approval/approver');
const treasurerRoute = require('./routes/approval/treasurer');
const deadlineAuthorizationRoute = require('./routes/approval/deadlineAuthorization');
const substitutionRoute = require('./routes/approval/substitution');
const adminRoute = require('./routes/admin/admin');

app.use('/role', roleRoute);
app.use('/position', positionRoute);
app.use('/section', sectionRoute);
app.use('/vehicle', vehicleRoute);
app.use('/document', documentRoute);
app.use('/audit', auditRoute);
app.use('/expense-category', expenseCategoryRoute);
app.use('/invoice', invoiceRoute);
app.use('/expense', expenseRoute);
app.use('/tax', taxRoute);
app.use('/review', reviewRoute);
app.use('/supplier', supplierRoute);
app.use('/user', userRoute);
app.use('/trip', tripRoute);
app.use('/treasurer', treasurerRoute);
app.use('/auth', authRoute);
app.use('/admin', adminRoute);
app.use('/reviewer', reviewerRoute);
app.use('/deadline-authorization', deadlineAuthorizationRoute);
app.use('/substitution', substitutionRoute);
app.use('/approver', approverRoute);

// Traduce los errores de carga de archivos a una respuesta legible
app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({error: 'La imagen supera el tamaño máximo permitido de 8 MB'});
  }
  if (error?.code === 'LIMIT_FILE_COUNT' || error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({error: 'Se adjuntaron más archivos de los permitidos: un comprobante y hasta 2 respaldos'});
  }
  if (error) {
    console.log('Error no controlado:', error.message);
    return res.status(500).json({error: error.message || 'Error procesando la solicitud'});
  }
  return next();
});

module.exports = app;
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const app = express()

app.use(helmet())

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://scv-frontend.vercel.app',
    'https://scv-frontend-git-develop-mat13.vercel.app'
  ],
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())

app.get('/', (req, res) => {
  res.send('Hello World!')
})

const roleRoute = require('./routes/catalog/role')
const taxRoute = require('./routes/catalog/tax')
const expenseCategoryRoute = require('./routes/catalog/expenseCategory')
const positionRoute = require('./routes/catalog/position')
const sectionRoute = require('./routes/catalog/section')
const auditRoute = require('./routes/catalog/audit')
const userRoute = require('./routes/user/user')
const authRoute = require('./routes/user/auth')
const tripRoute = require('./routes/trip/trip')
const expenseRoute = require('./routes/expense/expense')
const invoiceRoute = require('./routes/expense/invoice')
const invoiceDetailRoute = require('./routes/expense/invoiceDetail')
const imageRoute = require('./routes/expense/image')
const supplierRoute = require('./routes/expense/supplier')
const reviewRoute = require('./routes/approval/review')
const reviewerRoute = require('./routes/approval/reviewer')
const approverRoute = require('./routes/approval/approver')
const treasurerRoute = require('./routes/approval/treasurer')
const deadlineAuthorizationRoute = require('./routes/approval/deadlineAuthorization')
const substitutionRoute = require('./routes/approval/substitution')
const adminRoute = require('./routes/admin/admin')

app.use('/role', roleRoute)
app.use('/position', positionRoute)
app.use('/section', sectionRoute)
app.use('/audit', auditRoute)
app.use('/expense-category', expenseCategoryRoute)
app.use('/invoice-detail', invoiceDetailRoute)
app.use('/invoice', invoiceRoute)
app.use('/expense', expenseRoute)
app.use('/image', imageRoute)
app.use('/tax', taxRoute)
app.use('/review', reviewRoute)
app.use('/supplier', supplierRoute)
app.use('/user', userRoute)
app.use('/trip', tripRoute)
app.use('/treasurer', treasurerRoute)
app.use('/auth', authRoute)
app.use('/admin', adminRoute)
app.use('/reviewer', reviewerRoute)
app.use('/deadline-authorization', deadlineAuthorizationRoute)
app.use('/substitution', substitutionRoute)
app.use('/approver', approverRoute)

// Traduce los errores de carga de archivos a una respuesta legible
app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({error: 'La imagen supera el tamaño máximo permitido de 8 MB'})
  }
  if (error?.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({error: 'Solo se permite un archivo por solicitud'})
  }
  if (error) {
    console.log('Error no controlado:', error.message)
    return res.status(500).json({error: error.message || 'Error procesando la solicitud'})
  }
  return next()
});

module.exports = app;
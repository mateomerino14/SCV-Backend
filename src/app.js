const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const app = express()

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://scv-frontend.vercel.app'
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
const auditRoute = require('./routes/catalog/audit')
const userRoute = require('./routes/user/user')
const authRoute = require('./routes/user/auth')
const tripRoute = require('./routes/trip/trip')
const expenseRoute = require('./routes/expense/expense')
const invoiceRoute = require('./routes/expense/invoice')
const invoiceDetailRoute = require('./routes/expense/invoiceDetail')
const imageRoute = require('./routes/expense/image')
const supplierRoute = require('./routes/expense/supplier')
const commentRoute = require('./routes/expense/comment')
const reviewRoute = require('./routes/approval/review')
const reviewerRoute = require('./routes/approval/reviewer')
const approverRoute = require('./routes/approval/approver')
const treasurerRoute = require('./routes/approval/treasurer')
const deadlineAuthorizationRoute = require('./routes/approval/deadlineAuthorization')
const adminRoute = require('./routes/admin/admin')

app.use('/role', roleRoute)
app.use('/position', positionRoute)
app.use('/audit', auditRoute)
app.use('/comment', commentRoute)
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
app.use('/approver', approverRoute)

module.exports = app;
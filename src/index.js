const app = require('./app')
const cron = require('node-cron')
const dailyDigestService = require('./services/shared/dailyDigestService')
const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

// Envia el resumen de pendientes 3 veces al dia (08:00, 12:00 y 16:00, hora Bolivia)
cron.schedule('0 8,12,16 * * *', () => {
  dailyDigestService.sendDailyDigest()
}, {timezone: 'America/La_Paz'})
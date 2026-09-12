const app = require('./app')
const cron = require('node-cron')
const dailyDigestService = require('./services/shared/dailyDigestService')
const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

// Envia el resumen diario de pendientes todos los dias a las 08:00 (hora Bolivia)
cron.schedule('0 8 * * *', () => {
  dailyDigestService.sendDailyDigest()
}, {timezone: 'America/La_Paz'})
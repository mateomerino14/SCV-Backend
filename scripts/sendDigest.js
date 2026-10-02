// Envia ahora el resumen de pendientes, sin esperar a las 08:00, 12:00 o 16:00.
//   npm run resumen           envia los correos de verdad
//   npm run resumen -- --prueba   solo muestra en la consola a quien le llegaria y que diria
require('dotenv').config()
const supabase = require('../src/config/supabase')
const emailService = require('../src/services/shared/emailService')
const dailyDigestService = require('../src/services/shared/dailyDigestService')

const dryRun = process.argv.includes('--prueba')
let sentCount = 0
let failedCount = 0

const originalSendEmail = emailService.sendEmail
emailService.sendEmail = async (recipients, subject, html, attachments) => {
  sentCount++
  const lines = [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((match) => `    - ${match[1]}`)
  console.log(`${dryRun ? '[prueba] ' : ''}${recipients.map((recipient) => recipient.email).join(', ')} | ${subject}`)
  console.log(lines.join('\n'))
  if (!dryRun) {
    try {
      await originalSendEmail(recipients, subject, html, attachments)
    }
    catch (error) {
      failedCount++
      throw error
    }
  }
}

const run = async () => {
  // Sin conexion a la base, el resumen no encontraria pendientes y pareceria que no hay nada
  const {error} = await supabase.from('Usuario').select('id_usuario', {head: true, count: 'exact'})
  if (error) {
    console.error('No se pudo conectar a la base de datos. Revisa SUPABASE_URL y SUPABASE_KEY en el .env:', error.message || error)
    process.exit(1)
  }
  console.log(dryRun ? 'Resumen de pendientes (modo prueba, no se envía nada):' : 'Enviando resumen de pendientes...')
  await dailyDigestService.sendDailyDigest()
  if (sentCount === 0) {
    console.log('Nadie tiene pendientes: no se envió ningún correo.')
  }
  else {
    console.log(dryRun ? `${sentCount} correo(s) se enviarían.` : `Listo: ${sentCount - failedCount} enviado(s), ${failedCount} con error.`)
  }
  process.exit(0)
}

run()

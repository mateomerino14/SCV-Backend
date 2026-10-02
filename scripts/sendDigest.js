// Envia ahora el resumen de pendientes, sin esperar a la hora programada.
//   npm run resumen               envia los correos de verdad
//   npm run resumen -- --prueba   solo muestra a quien le llegaria y que diria
// Lo mismo puede hacerse desde la pantalla Recordatorios del administrador.
require('dotenv').config()
const supabase = require('../src/config/supabase')
const reminderScheduleService = require('../src/services/shared/reminderScheduleService')

const dryRun = process.argv.includes('--prueba')

const run = async () => {
  // Sin conexion a la base, el resumen no encontraria pendientes y pareceria que no hay nada
  const {error} = await supabase.from('Usuario').select('id_usuario', {head: true, count: 'exact'})
  if (error) {
    console.error('No se pudo conectar a la base de datos. Revisa SUPABASE_URL y SUPABASE_KEY en el .env:', error.message || error)
    process.exit(1)
  }
  console.log(dryRun ? 'Resumen de pendientes (modo prueba, no se envía nada):' : 'Enviando resumen de pendientes...')
  const result = await reminderScheduleService.sendNow({dryRun})
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  result.mensajes.forEach((message) => {
    let status = '[prueba]'
    if (!dryRun) {
      status = message.enviado ? '[enviado]' : `[error: ${message.error}]`
    }
    console.log(`${status} ${message.correo} | ${message.asunto}`)
    message.lineas.forEach((line) => console.log(`    - ${line}`))
  })
  if (result.total === 0) {
    console.log('Nadie tiene pendientes: no se envió ningún correo.')
  }
  else if (dryRun) {
    console.log(`${result.total} correo(s) se enviarían.`)
  }
  else {
    console.log(`Listo: ${result.enviados} enviado(s), ${result.fallidos} con error.`)
  }
  process.exit(0)
}

run()

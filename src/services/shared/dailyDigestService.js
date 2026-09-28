const supabase = require('../../config/supabase')
const emailService = require('./emailService')
const userDirectoryService = require('../user/userDirectoryService')

// Obtiene los usuarios activos con un rol determinado y correo corporativo
const getActiveUsersByRole = async (roleName) => {
  const {data, error} = await supabase
    .from('Usuario')
    .select('id_usuario, nombre, apellido_paterno, email_corporativo, Rol!inner(nombre)')
    .eq('activo', true)
    .eq('Rol.nombre', roleName)
  if (error) {
    return []
  }
  return (data || []).filter((user) => user.email_corporativo && user.email_corporativo.trim() !== '')
}

// Cuenta cuantos viajes esperan cada tipo de revision
const getPendingCounts = async () => {
  const [tripReviews, expenseReviews, approverReviews, alcoholReviews, reviewerReviews, treasurerReviews] = await Promise.all([
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_VIAJE').is('id_supervisor_asignado', null),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION').is('id_supervisor_asignado', null),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'APROBADO_VIAJE'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_APROBADOR'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'APROBADO_SUPERVISOR'),
    supabase.from('Viaje').select('id_viaje', {count: 'exact', head: true}).eq('estado', 'EN_REVISION_TESORERO'),
  ])
  return {
    pendingTripReviews: tripReviews.count || 0,
    pendingExpenseReviews: expenseReviews.count || 0,
    pendingApproverReviews: approverReviews.count || 0,
    pendingAlcoholReviews: alcoholReviews.count || 0,
    pendingReviewerReviews: reviewerReviews.count || 0,
    pendingTreasurerReviews: treasurerReviews.count || 0,
  }
}

// Arma y envia el correo resumen a un grupo de usuarios con un rol
const sendDigestToGroup = async (users, title, bodyLines) => {
  if (users.length === 0 || bodyLines.length === 0) {
    return
  }
  const items = bodyLines
    .map((line) => `<li style="margin: 0 0 8px 0; color: #2e2827; font-size: 14px;">${line}</li>`)
    .join('')
  const body = `
    ${emailService.emailParagraph('Hola, este es tu resumen de pendientes:')}
    <div style="background-color: #F3F6FF; border-left: 4px solid #870002; border-radius: 8px; padding: 14px 18px 6px 18px; margin: 4px 0 16px 0;">
      <ul style="margin: 0; padding-left: 18px;">${items}</ul>
    </div>
    ${emailService.emailParagraph('Ingresa al sistema para revisarlos.')}
    ${emailService.emailButton()}
  `
  const html = emailService.buildEmailLayout(title, body)
  await Promise.all(users.map((user) => emailService.sendEmail(
    [{email: user.email_corporativo, name: `${user.nombre} ${user.apellido_paterno}`}],
    title,
    html
  )))
}

// Envia el resumen diario de pendientes a supervisores, aprobadores, revisores y tesoreros
const sendDailyDigest = async () => {
  try {
    const counts = await getPendingCounts()

    const supervisors = await getActiveUsersByRole('SUPERVISOR')
    const supervisorLines = []
    if (counts.pendingTripReviews > 0) {
      supervisorLines.push(`${counts.pendingTripReviews} viaje(s) nuevo(s) esperando revisión.`)
    }
    if (counts.pendingExpenseReviews > 0) {
      supervisorLines.push(`${counts.pendingExpenseReviews} rendición(es) de gastos esperando revisión.`)
    }
    await sendDigestToGroup(supervisors, 'Resumen de Pendientes — Supervisión', supervisorLines)

    const approvers = await getActiveUsersByRole('APROBADOR')
    const approverLines = []
    if (counts.pendingApproverReviews > 0) {
      approverLines.push(`${counts.pendingApproverReviews} viaje(s) esperando tu aprobación previa a tesorería.`)
    }
    if (counts.pendingAlcoholReviews > 0) {
      approverLines.push(`${counts.pendingAlcoholReviews} rendición(es) con alcohol esperando tu revisión adicional.`)
    }
    await sendDigestToGroup(approvers, 'Resumen de Pendientes — Aprobación', approverLines)

    const reviewers = await getActiveUsersByRole('REVISOR')
    const reviewerLines = []
    if (counts.pendingReviewerReviews > 0) {
      reviewerLines.push(`${counts.pendingReviewerReviews} rendición(es) esperando tu revisión final.`)
    }
    await sendDigestToGroup(reviewers, 'Resumen de Pendientes — Revisión Final', reviewerLines)

    const activeUsers = await userDirectoryService.getActiveUsersWithActivePosition()
    const treasurers = userDirectoryService.getUsersByPositionName(activeUsers, userDirectoryService.treasurerPositionName)
    const treasurerLines = []
    if (counts.pendingTreasurerReviews > 0) {
      treasurerLines.push(`${counts.pendingTreasurerReviews} viaje(s) esperando la asignación de fondos.`)
    }
    await sendDigestToGroup(treasurers, 'Resumen de Pendientes — Tesorería', treasurerLines)
  }
  catch (error) {
    console.warn('Error enviando el resumen diario de pendientes:', error.message)
  }
}

module.exports = {getPendingCounts, sendDailyDigest}

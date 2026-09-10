const supabase = require('../../config/supabase')
const expenseSummaryService = require('./expenseSummaryService')
const tripCommentService = require('../trip/tripCommentService')
const emailService = require('../shared/emailService')
const userDirectoryService = require('../user/userDirectoryService')
const finalReviewDocumentService = require('./finalReviewDocumentService')

// Anexa el resumen de gastos y alertas a una lista de viajes
const attachSummaryToTrips = (trips) => {
  return trips.map((trip) => {
    const summary = expenseSummaryService.calculateExpenseSummary(trip.Gasto, trip)
    const {alerts, reviewStatus} = expenseSummaryService.buildReviewAlerts(summary, trip)
    return {
      ...trip,
      gastoAcumulado: summary.accumulatedExpense,
      gastoAcumuladoUsd: summary.accumulatedExpenseUsd,
      excedePresupuesto: summary.exceedsBudget,
      excedePresupuestoUsd: summary.exceedsBudgetUsd,
      alertas: alerts,
      estadoRevision: reviewStatus,
    }
  })
};

// Lista los viajes pendientes de revision final
const getPendingReviews = async (reviewerId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional)')
    .eq('estado', 'APROBADO_SUPERVISOR')
    .neq('id_usuario', reviewerId)
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio)
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin)
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado)
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {trips: attachSummaryToTrips(data || [])}
  }
};

// Lista las revisiones finales asignadas al revisor
const getMyReviews = async (reviewerId, filters) => {
  let query = supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, Cargo(nombre)), Gasto(monto_total, es_gasto_internacional), Comentario(*)')
    .eq('id_revisor_asignado', reviewerId)
  if (filters.fecha_inicio) {
    query = query.gte('fecha_inicio', filters.fecha_inicio)
  }
  if (filters.fecha_fin) {
    query = query.lte('fecha_fin', filters.fecha_fin)
  }
  if (filters.id_empleado) {
    query = query.eq('id_usuario', filters.id_empleado)
  }
  const {data, error} = await query.order('fecha_inicio', {ascending: false})
  if (error) {
    return {error: error.message}
  }
  else {
    return {trips: attachSummaryToTrips(data || [])}
  }
};

// Obtiene el detalle de un viaje en revision final
const getReviewDetail = async (tripId, reviewerId) => {
  const {data: trip, error: tripError} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, foto_perfil, numero_dependencia, numero_seccion, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (tripError) {
    return {error: tripError.message, status: 500}
  }
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  const {data: expenses} = await supabase
    .from('Gasto')
    .select('*, Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal), Categoria_Gasto(nombre), Factura(numero_factura, fecha_emision, monto_parcial, Detalle_Factura(nombre_producto, cantidad, precio)), Imagen(url_archivo), Gasto_Tramo_Moneda(moneda, monto_origen, tipo_cambio, monto_usd), Gasto_Subitem(id_subitem, descripcion, monto)')
    .eq('id_viaje', tripId)
  const {data: comments} = await supabase
    .from('Comentario').select('*').eq('id_viaje', tripId).eq('id_usuario', reviewerId).order('fecha', {ascending: false})
  const summary = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  const {alerts} = expenseSummaryService.buildReviewAlerts(summary, trip)
  return {
    trip,
    expenses: expenses || [],
    comments: comments || [],
    accumulatedExpense: summary.accumulatedExpense,
    accumulatedExpenseUsd: summary.accumulatedExpenseUsd,
    exceedsBudget: summary.exceedsBudget,
    exceedsBudgetUsd: summary.exceedsBudgetUsd,
    alerts,
  }
};

// Notifica a tesoreria con el documento de rendicion final
const notifyTreasurer = async (trip, reviewer, tripCode, expenses) => {
  const activeUsers = await userDirectoryService.getActiveUsersWithActivePosition()
  const treasurers = userDirectoryService.getUsersByPositionName(activeUsers, userDirectoryService.treasurerPositionName)
  if (treasurers.length === 0) {
    console.warn('[notifyTreasurer] No se encontró ningún usuario activo con el cargo de tesorero y correo corporativo.')
    return
  }
  const to = treasurers.map((treasurer) => ({email: treasurer.email_corporativo, name: `${treasurer.nombre} ${treasurer.apellido_paterno}`}))
  const renditionHtml = finalReviewDocumentService.generateRenditionHtml(trip, reviewer, tripCode, expenses)
  const pdfBuffer = await finalReviewDocumentService.generatePdf(renditionHtml)
  const pdfBase64 = pdfBuffer.toString('base64')
  const attachments = [{content: pdfBase64, name: `Rendicion_Final_${tripCode.replace('/', '-')}.pdf`}]
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Rendición de Gastos — Aprobación Final</h2>
    <p style="margin-bottom:8px;">Se adjunta la rendición de gastos con aprobación final correspondiente al viaje <strong>${tripCode}</strong>.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`
  await emailService.sendEmail(to, `Rendición Final — ${tripCode}`, emailHtml, attachments)
};

// Notifica al empleado el resultado de su rendicion
const notifyEmployee = async (trip, tripCode, expenses) => {
  const employee = trip.Usuario
  if (!employee?.email_corporativo) {
    console.warn(`[notifyEmployee] El empleado ${employee?.nombre} ${employee?.apellido_paterno} (id_usuario ${employee?.id_usuario}) no tiene email_corporativo registrado. No se envió el resultado de la rendición.`)
    throw new Error('El empleado no tiene correo corporativo registrado')
  }
  const summary = expenseSummaryService.calculateExpenseSummary(expenses, trip)
  const isInternational = trip.tipo === 'Internacional'
  const assignedAmount = parseFloat(trip.monto_asignado)
  const assignedAmountUsd = parseFloat(trip.monto_asignado_usd || 0)
  const nationalBalance = assignedAmount - summary.accumulatedExpense
  const usdBalance = assignedAmountUsd - summary.accumulatedExpenseUsd
  const resultSummary = {
    totalNational: summary.accumulatedExpense,
    totalUsd: summary.accumulatedExpenseUsd,
    nationalBalance,
    usdBalance,
    exceedsNational: nationalBalance < 0,
    exceedsUsd: usdBalance < 0,
    isInternational,
  }
  const resultHtml = finalReviewDocumentService.generateEmployeeResultHtml(trip, tripCode, resultSummary)
  const pdfBuffer = await finalReviewDocumentService.generatePdf(resultHtml)
  const pdfBase64 = pdfBuffer.toString('base64')
  const attachments = [{content: pdfBase64, name: `Resultado_Rendicion_${tripCode.replace('/', '-')}.pdf`}]
  const exceeds = resultSummary.exceedsNational || resultSummary.exceedsUsd
  let bodyText = 'Debes devolver el saldo restante a la empresa.'
  if (exceeds) {
    bodyText = 'Se te reembolsará el saldo excedido.'
  }
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;color:#000;">
    <h2 style="font-size:16pt;margin-bottom:12px;">Tu rendición fue aprobada</h2>
    <p style="margin-bottom:8px;">La rendición de gastos del viaje <strong>${tripCode}</strong> fue aprobada de forma definitiva.</p>
    <p style="margin-bottom:8px;">${bodyText} Revisa el detalle en el documento adjunto.</p>
    <p style="font-size:10pt;color:#666;margin-top:16px;">Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.</p>
  </div>`
  await emailService.sendEmail(
    [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
    `Resultado de tu Rendición de Gastos — ${tripCode}`,
    emailHtml,
    attachments
  )
};

// Aprueba definitivamente un viaje
const approveReview = async (tripId, reviewerId) => {
  const {data: trip} = await supabase
    .from('Viaje')
    .select('*, Usuario!viaje_id_usuario_foreign(id_usuario, nombre, apellido_paterno, email_corporativo, foto_perfil, Cargo(nombre))')
    .eq('id_viaje', tripId)
    .single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === reviewerId) {
    return {error: 'No puedes aprobar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'APROBADO_SUPERVISOR') {
    return {error: 'Este viaje no está en revisión final', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'APROBADO_FINAL', id_revisor_asignado: reviewerId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  const {data: reviewer} = await supabase.from('Usuario').select('nombre, apellido_paterno, Cargo(nombre)').eq('id_usuario', reviewerId).single()
  const {data: expenses} = await supabase
    .from('Gasto').select('*, Categoria_Gasto(nombre), Proveedor(nombre), Factura(numero_factura, monto_parcial)').eq('id_viaje', tripId)
  const year = new Date().getFullYear()
  const tripCode = `VIA-${tripId}/${year}`
  let warning = null
  try {
    await notifyTreasurer(trip, reviewer, tripCode, expenses || [])
  }
  catch (emailError) {
    console.error('[approveReview] Error enviando rendición a tesorero:', emailError)
    warning = 'El viaje se aprobó pero hubo un problema al enviar la rendición al tesorero. Contacta al administrador del sistema.'
  }
  try {
    await notifyEmployee(trip, tripCode, expenses || [])
  }
  catch (emailError) {
    console.error('[approveReview] Error enviando resultado al empleado:', emailError)
    if (!warning) {
      warning = 'El viaje se aprobó pero hubo un problema al enviar el resultado al empleado. Contacta al administrador del sistema.'
    }
  }
  return {message: 'Viaje aprobado finalmente', warning}
};

// Rechaza definitivamente un viaje
const rejectReview = async (tripId, reviewerId) => {
  const {data: trip} = await supabase.from('Viaje').select('id_usuario, estado, ciclo_revision').eq('id_viaje', tripId).single()
  if (!trip) {
    return {error: 'Viaje no encontrado', status: 404}
  }
  if (trip.id_usuario === reviewerId) {
    return {error: 'No puedes rechazar tu propio viaje', status: 403}
  }
  if (trip.estado !== 'APROBADO_SUPERVISOR') {
    return {error: 'Este viaje no está en revisión final', status: 400}
  }
  const {data: existingComments} = await supabase
    .from('Comentario')
    .select('id_comentario')
    .eq('id_viaje', tripId)
    .eq('id_usuario', reviewerId)
    .eq('tipo', 'OBSERVACION')
    .eq('ciclo_revision', trip.ciclo_revision || 1)
    .not('id_gasto', 'is', null)
  if (!existingComments || existingComments.length === 0) {
    return {error: 'Debes agregar al menos una observación a algún gasto antes de rechazar', status: 400}
  }
  const {error} = await supabase.from('Viaje').update({estado: 'RECHAZADO', id_revisor_asignado: reviewerId}).eq('id_viaje', tripId)
  if (error) {
    return {error: error.message, status: 500}
  }
  else {
    return {message: 'Viaje rechazado correctamente'}
  }
};

module.exports = {
  getPendingReviews, getMyReviews, getReviewDetail, approveReview, rejectReview,
  addComment: tripCommentService.addTripComment,
  editComment: tripCommentService.editTripComment,
  deleteComment: tripCommentService.deleteTripComment,
};
const SibApiV3Sdk = require('sib-api-v3-sdk')
const axios = require('axios')
const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

// Valida que un correo exista y pueda recibir mensajes
const validateEmailExists = async (email) => {
  try {
    const response = await axios.get('https://emailreputation.abstractapi.com/v1/', {
      params: {
        api_key: process.env.ABSTRACT_EMAIL_API_KEY,
        email,
      },
    })
    const {email_deliverability: emailDeliverability} = response.data
    if (!emailDeliverability?.is_format_valid) {
      return {valid: false, reason: 'Formato de correo inválido'}
    }
    else if (!emailDeliverability?.is_mx_valid) {
      return {valid: false, reason: 'El dominio del correo no existe'}
    }
    else if (emailDeliverability?.status === 'undeliverable') {
      return {valid: false, reason: 'El correo no existe o no puede recibir mensajes'}
    }
    else {
      return {valid: true}
    }
  }
  catch (error) {
    console.warn('Email validation error:', error.message)
    return {valid: true}
  }
};

// Genera el layout HTML compartido para los correos del sistema
const buildEmailLayout = (title, bodyContent, accentColor = '#870002') => {
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="color: ${accentColor}; font-size: 18px; margin-bottom: 16px;">${title}</h2>
      ${bodyContent}
      <p style="color: #475569; font-size: 12px; margin-top: 24px;">
        Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA.
      </p>
    </div>
  `
};

// Envia un correo con el codigo de verificacion
const sendVerificationCode = async (toEmail, userName, code) => {
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  const body = `
    <p>Hola <strong>${userName}</strong>,</p>
    <p>Tu código de verificación es:</p>
    <div style="background-color: #870002; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 16px; border-radius: 8px; letter-spacing: 8px; margin: 16px 0;">
      ${code}
    </div>
    <p style="color: #475569; font-size: 12px;">
      Este código expira en 5 minutos. Si no solicitaste este código, ignora este mensaje.
    </p>
  `
  await api.sendTransacEmail({
    sender: {name: 'Flujo de Viajes', email: 'mateomerino988@gmail.com'},
    to: [{email: toEmail}],
    subject: 'Código de verificación',
    htmlContent: buildEmailLayout('Flujo de Viajes', body),
  })
};

// Envia un correo generico, con adjuntos opcionales
const sendEmail = async (to, subject, htmlContent, attachments = [], senderName = 'Sistema de Viáticos') => {
  if (!to || to.length === 0) {
    return
  }
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  const payload = {
    sender: {name: senderName, email: 'mateomerino988@gmail.com'},
    to,
    subject,
    htmlContent,
  }
  if (attachments.length > 0) {
    payload.attachment = attachments
  }
  await api.sendTransacEmail(payload)
};

// Notifica a un empleado que su viaje o rendicion fue rechazado, sin detallar las observaciones
const sendRejectionNotice = async (employee) => {
  if (!employee?.email_corporativo) {
    return
  }
  try {
    const body = `
      <p>Hola <strong>${employee.nombre}</strong>,</p>
      <p>Tu solicitud fue rechazada. Ingresa al sistema para revisar el detalle y corregirla.</p>
    `
    const html = buildEmailLayout('Solicitud rechazada', body, '#D20F12')
    await sendEmail(
      [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
      'Tu solicitud fue rechazada',
      html
    )
  }
  catch (error) {
    console.warn('Error enviando correo de rechazo:', error.message)
  }
};

module.exports = {sendVerificationCode, validateEmailExists, sendEmail, buildEmailLayout, sendRejectionNotice};
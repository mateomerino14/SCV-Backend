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

// Envia un correo con el codigo de verificacion
const sendVerificationCode = async (toEmail, userName, code) => {
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  await api.sendTransacEmail({
    sender: {name: 'Flujo de Viajes', email: 'mateomerino988@gmail.com'},
    to: [{email: toEmail}],
    subject: 'Código de verificación',
    htmlContent: `
      <div style="font-family: Inter, sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #870002;">Flujo de Viajes</h2>
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Tu código de verificación es:</p>
        <div style="background-color: #870002; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 16px; border-radius: 8px; letter-spacing: 8px;">
          ${code}
        </div>
        <p style="color: #475569; font-size: 12px; margin-top: 16px;">
          Este código expira en 5 minutos. Si no solicitaste este código, ignora este mensaje.
        </p>
      </div>
    `
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

module.exports = {sendVerificationCode, validateEmailExists, sendEmail};
const SibApiV3Sdk = require('sib-api-v3-sdk')

const defaultClient = SibApiV3Sdk.ApiClient.instance
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY

const sendVerificationCode = async (toEmail, nombre, code) => {
  const api = new SibApiV3Sdk.TransactionalEmailsApi()
  await api.sendTransacEmail({
    sender: { name: 'Flujo de Viajes', email: 'mateomerino988@gmail.com' },
    to: [{ email: toEmail }],
    subject: 'Código de verificación',
    htmlContent: `
      <div style="font-family: Inter, sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #870002;">Flujo de Viajes</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
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
}

module.exports = { sendVerificationCode }
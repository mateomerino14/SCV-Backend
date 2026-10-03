const SibApiV3Sdk = require('sib-api-v3-sdk');
const axios = require('axios');
const {escapeHtml} = require('../../utils/htmlEscape');
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

// Valida que un correo exista y pueda recibir mensajes
const validateEmailExists = async (email) => {
  try {
    const response = await axios.get('https://emailreputation.abstractapi.com/v1/', {
      params: {
        api_key: process.env.ABSTRACT_EMAIL_API_KEY,
        email,
      },
    });
    const {email_deliverability: emailDeliverability} = response.data;
    if (!emailDeliverability?.is_format_valid) {
      return {valid: false, reason: 'Formato de correo inválido'};
    }
    else if (!emailDeliverability?.is_mx_valid) {
      return {valid: false, reason: 'El dominio del correo no existe'};
    }
    else if (emailDeliverability?.status === 'undeliverable') {
      return {valid: false, reason: 'El correo no existe o no puede recibir mensajes'};
    }
    else {
      return {valid: true};
    }
  }
  catch (error) {
    console.warn('Email validation error:', error.message);
    return {valid: true};
  }
};

// Paleta institucional (la misma de src/constants del frontend)
const BRAND = {
  primary: '#870002',
  title: '#500203',
  text: '#2e2827',
  labels: '#475569',
  background: '#FFFFFF',
  backgroundHeader: '#F3F6FF',
  softRed: '#fde9e9',
  border: '#DEE2F0',
  footer: '#E9EBF2',
};

const fontFamily = "Inter, 'Segoe UI', Arial, sans-serif";

// Genera el layout HTML de los correos, con tablas y estilos en linea
const buildEmailLayout = (title, bodyContent) => {
  return `
  <div style="margin: 0; padding: 0; background-color: ${BRAND.backgroundHeader};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.backgroundHeader}; padding: 32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: ${BRAND.background}; border-radius: 14px; overflow: hidden; border: 1px solid ${BRAND.border}; font-family: ${fontFamily};">
            <tr>
              <td style="background-color: ${BRAND.primary}; padding: 18px 28px;">
                <p style="margin: 0; color: #ffffff; font-size: 16px; font-weight: bold; letter-spacing: 2px;">MAXAM FANEXA</p>
                <p style="margin: 2px 0 0 0; color: #f3d6d6; font-size: 12px;">Sistema de Control de Viáticos</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 28px 8px 28px;">
                <h1 style="margin: 0; color: ${BRAND.title}; font-size: 22px; line-height: 1.3; font-weight: bold;">${title}</h1>
                <div style="width: 48px; height: 3px; background-color: ${BRAND.primary}; border-radius: 2px; margin-top: 12px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 28px 28px 28px; color: ${BRAND.text}; font-size: 14px; line-height: 1.6;">
                ${bodyContent}
              </td>
            </tr>
            <tr>
              <td style="background-color: ${BRAND.footer}; padding: 16px 28px;">
                <p style="margin: 0; color: ${BRAND.labels}; font-size: 12px; line-height: 1.5;">
                  Este es un mensaje automático del Sistema de Control de Viáticos — MAXAM FANEXA. Por favor, no respondas a este correo.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
};

// Parrafo con el estilo de texto de los correos
const emailParagraph = (content) => {
  return `<p style="margin: 0 0 14px 0; color: ${BRAND.text}; font-size: 14px; line-height: 1.6;">${content}</p>`;
};

// Nota secundaria en gris, para aclaraciones al final del correo
const emailNote = (content) => {
  return `<p style="margin: 14px 0 0 0; color: ${BRAND.labels}; font-size: 13px; line-height: 1.5;">${content}</p>`;
};

// Caja de datos con pares etiqueta / valor (los valores son texto plano y se escapan)
const emailInfoBox = (rows) => {
  const items = rows
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')
    .map((row, index, list) => {
      const marginBottom = index < list.length - 1 ? '12px' : '0';
      return `
        <p style="margin: 0 0 3px 0; color: ${BRAND.labels}; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${row.label}</p>
        <p style="margin: 0 0 ${marginBottom} 0; color: ${BRAND.text}; font-size: 14px;">${escapeHtml(row.value)}</p>
      `;
    })
    .join('');
  return `<div style="background-color: ${BRAND.backgroundHeader}; border-radius: 10px; padding: 16px 18px; margin: 4px 0 16px 0;">${items}</div>`;
};

// Caja destacada en rojo institucional, para el dato principal del correo (valor en texto plano)
const emailHighlightBox = (label, value) => {
  return `
    <div style="background-color: ${BRAND.softRed}; border-left: 4px solid ${BRAND.primary}; border-radius: 8px; padding: 14px 18px; margin: 4px 0 16px 0;">
      <p style="margin: 0 0 4px 0; color: ${BRAND.primary}; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${label}</p>
      <p style="margin: 0; color: ${BRAND.title}; font-size: 17px; font-weight: bold;">${escapeHtml(value)}</p>
    </div>
  `;
};

// Boton para ingresar al sistema (solo si FRONTEND_URL esta configurado)
const emailButton = (text = 'Ingresar al sistema', url = process.env.FRONTEND_URL) => {
  if (!url) {
    return '';
  }
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 4px 0;">
      <tr>
        <td style="background-color: ${BRAND.primary}; border-radius: 8px;">
          <a href="${url}" style="display: inline-block; padding: 11px 22px; color: #ffffff; font-size: 14px; font-weight: bold; text-decoration: none; font-family: ${fontFamily};">${text}</a>
        </td>
      </tr>
    </table>
  `;
};

// Envia un correo con el codigo de verificacion
const sendVerificationCode = async (toEmail, userName, code) => {
  const api = new SibApiV3Sdk.TransactionalEmailsApi();
  const body = `
    ${emailParagraph(`Hola <strong>${escapeHtml(userName)}</strong>,`)}
    ${emailParagraph('Usa este código para continuar con la recuperación de tu cuenta:')}
    <div style="background-color: ${BRAND.primary}; color: #ffffff; font-size: 32px; font-weight: bold; text-align: center; padding: 16px; border-radius: 10px; letter-spacing: 8px; margin: 8px 0 16px 0;">
      ${code}
    </div>
    ${emailNote('Este código expira en 5 minutos. Si no solicitaste este código, ignora este mensaje.')}
  `;
  await api.sendTransacEmail({
    sender: {name: 'Sistema de Viáticos', email: 'mateomerino988@gmail.com'},
    to: [{email: toEmail}],
    subject: 'Código de verificación',
    htmlContent: buildEmailLayout('Código de verificación', body),
  });
};

// Envia un correo generico, con adjuntos opcionales
const sendEmail = async (to, subject, htmlContent, attachments = [], senderName = 'Sistema de Viáticos') => {
  if (!to || to.length === 0) {
    return;
  }
  const api = new SibApiV3Sdk.TransactionalEmailsApi();
  const payload = {
    sender: {name: senderName, email: 'mateomerino988@gmail.com'},
    to,
    subject,
    htmlContent,
  };
  if (attachments.length > 0) {
    payload.attachment = attachments;
  }
  await api.sendTransacEmail(payload);
};

// Notifica a un empleado que su viaje o rendicion fue rechazado, sin detallar las observaciones
const sendRejectionNotice = async (employee) => {
  if (!employee?.email_corporativo) {
    return;
  }
  try {
    const body = `
      ${emailParagraph(`Hola <strong>${escapeHtml(employee.nombre)}</strong>,`)}
      ${emailParagraph('Tu solicitud fue rechazada. Ingresa al sistema para revisar las observaciones y corregirla.')}
      ${emailButton()}
    `;
    const html = buildEmailLayout('Solicitud rechazada', body);
    await sendEmail(
      [{email: employee.email_corporativo, name: `${employee.nombre} ${employee.apellido_paterno}`}],
      'Tu solicitud fue rechazada',
      html
    );
  }
  catch (error) {
    console.warn('Error enviando correo de rechazo:', error.message);
  }
};

module.exports = {
  sendVerificationCode, validateEmailExists, sendEmail, sendRejectionNotice,
  buildEmailLayout, emailParagraph, emailNote, emailInfoBox, emailHighlightBox, emailButton,
};
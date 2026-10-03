const {GoogleGenerativeAI} = require('@google/generative-ai');

const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo principal y modelo de respaldo, de menor carga, usado cuando el principal falla
const primaryModelName = 'gemini-3.6-flash';
const fallbackModelName = 'gemini-3.5-flash-lite';
const primaryModel = geminiClient.getGenerativeModel({model: primaryModelName});
const fallbackModel = geminiClient.getGenerativeModel({model: fallbackModelName});

// Indica si el error es por cuota agotada (429), para pasar directo al respaldo
const isQuotaError = (error) => {
  const message = error?.message || '';
  return message.includes('429') || message.toLowerCase().includes('quota');
};

// Ejecuta la peticion con un modelo, reintentando ante errores temporales (503, red)
const generateWithRetries = async (model, modelName, request, maxAttempts, taskName) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(request);
      return result.response.text().trim();
    }
    catch (error) {
      lastError = error;
      if (isQuotaError(error)) {
        console.warn(`[Gemini] ${taskName}: cuota agotada en ${modelName}.`);
        break;
      }
      if (attempt < maxAttempts) {
        console.warn(`[Gemini] ${taskName}: intento ${attempt} fallido en ${modelName}, reintentando...`, error.message);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
};

// Genera contenido con el modelo principal y, si falla, con el de respaldo
const generateText = async (request, {taskName = 'consulta', maxAttempts = 3} = {}) => {
  try {
    return await generateWithRetries(primaryModel, primaryModelName, request, maxAttempts, taskName);
  }
  catch (primaryError) {
    console.warn(`[Gemini] ${taskName}: usando el modelo de respaldo ${fallbackModelName}.`);
    try {
      const text = await generateWithRetries(fallbackModel, fallbackModelName, request, maxAttempts, taskName);
      console.info(`[Gemini] ${taskName}: resuelto con el modelo de respaldo.`);
      return text;
    }
    catch (fallbackError) {
      console.warn(`[Gemini] ${taskName}: fallaron ambos modelos.`, fallbackError.message);
      throw fallbackError;
    }
  }
};

module.exports = {generateText, isQuotaError};

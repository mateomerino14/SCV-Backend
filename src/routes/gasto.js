const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const multer = require('multer')
const FormData = require('form-data')
const axios = require('axios')
const Groq = require('groq-sdk')
const { actualizarAlcoholEnViaje } = require('../utils/alcoholUtils')

const upload = multer({ storage: multer.memoryStorage() })
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const detectarTipoDoc = (nit) => {
  if (!nit || nit === 'No Especificado') return null
  const soloNumeros = nit.replace(/[-.\s]/g, '')
  if (/^[0-9]+$/.test(soloNumeros)) {
    if (soloNumeros.length >= 9) return 'NIT'
    return 'CI'
  }
  return 'NIT'
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /facturas/extraer
// Extrae datos de una imagen de factura vía OCR + Groq
// ─────────────────────────────────────────────────────────────────────────────
router.post('/extraer', authMiddleware, upload.single('factura'), async (req, res) => {
  try {
    const formData = new FormData()
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    })
    formData.append('language', 'spa')
    formData.append('isOverlayRequired', 'false')
    formData.append('OCREngine', '2')

    const ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: { ...formData.getHeaders(), apikey: process.env.OCR_SPACE_API_KEY },
    })

    const texto = ocrResponse.data?.ParsedResults?.[0]?.ParsedText || ''

    const chatResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: `Analiza este texto extraído de una factura y devuelve SOLO un JSON sin texto adicional ni backticks con esta estructura exacta:
{
  "proveedor": "nombre del proveedor o empresa emisora",
  "numero_factura": "número de factura",
  "nit": "NIT o CI del proveedor (solo números, máximo 10 dígitos)",
  "fecha_emision": "fecha en formato YYYY-MM-DD",
  "iva": monto_numerico_del_impuesto_en_dinero_NO_el_porcentaje,
  "monto": monto_numerico_sin_impuestos,
  "monto_total": monto_numerico_total_con_impuestos,
  "tipo_doc": "F si tiene IVA o impuesto, R si es recibo sin impuesto",
  "detalle": [
    { "nombre_producto": "descripcion del producto", "cantidad": numero, "precio": numero_decimal }
  ]
}

IMPORTANTE: El campo iva debe ser el MONTO EN DINERO del impuesto, no el porcentaje.

Texto de la factura:
${texto}`,
        },
      ],
    })

    const respuesta = chatResponse.choices[0]?.message?.content?.trim() || ''
    const datos = JSON.parse(respuesta)

    return res.json({
      proveedor: datos.proveedor || 'No Especificado',
      numero_factura: datos.numero_factura || 'No Especificado',
      nit: datos.nit || null,
      fecha_emision: datos.fecha_emision || '',
      iva: datos.iva || 0,
      monto: datos.monto || 0,
      monto_total: datos.monto_total || 0,
      tipo_doc: datos.tipo_doc || 'F',
      detalle: datos.detalle || [],
    })
  } catch (error) {
    console.log('Error extrayendo factura:', error)
    return res.status(500).json({ error: 'Error al procesar la factura' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /facturas/guardar
// ─────────────────────────────────────────────────────────────────────────────
router.post('/guardar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)

    if (!datos.proveedor) return res.status(400).json({ error: 'El nombre del proveedor es requerido' })
    if (!datos.numero_factura) return res.status(400).json({ error: 'El número de factura es requerido' })
    if (!datos.fecha_emision) return res.status(400).json({ error: 'La fecha de emisión es requerida' })
    if (!datos.monto_total || isNaN(parseFloat(datos.monto_total)))
      return res.status(400).json({ error: 'El monto total es requerido y debe ser un número válido' })
    if (!datos.tipo_doc || !['F', 'R'].includes(datos.tipo_doc))
      return res.status(400).json({ error: 'El tipo de documento debe ser Factura (F) o Recibo (R)' })
    if (!datos.id_viaje) return res.status(400).json({ error: 'El viaje asociado es requerido' })

    // Proveedor
    let id_proveedor = null
    const { data: proveedorExistente } = await supabase
      .from('Proveedor')
      .select('id_proveedor')
      .eq('nombre', datos.proveedor)
      .single()

    if (proveedorExistente) {
      id_proveedor = proveedorExistente.id_proveedor
      if (datos.nit) {
        await supabase
          .from('Proveedor')
          .update({ numero_doc_fiscal: datos.nit, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
          .eq('id_proveedor', proveedorExistente.id_proveedor)
      }
    } else {
      const { data: nuevoProv, error: provError } = await supabase
        .from('Proveedor')
        .insert({
          nombre: datos.proveedor,
          numero_doc_fiscal: datos.nit || null,
          tipo_doc_fiscal: detectarTipoDoc(datos.nit),
        })
        .select()
        .single()
      if (provError) return res.status(500).json({ error: provError.message })
      id_proveedor = nuevoProv?.id_proveedor
    }

    // Gasto
    const { data: gasto, error: gastoError } = await supabase
      .from('Gasto')
      .insert({
        monto_total: datos.monto_total,
        fecha_gasto: datos.fecha_emision,
        descripcion: `Factura ${datos.numero_factura} - ${datos.proveedor}`,
        tipo: datos.tipo_doc,
        modificado: datos.modificado_manualmente ? true : false,
        id_viaje: datos.id_viaje,
        id_proveedor,
      })
      .select()
      .single()

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    // Factura
    const { data: facturaData, error: facturaError } = await supabase
      .from('Factura')
      .insert({
        numero_factura: datos.numero_factura,
        fecha_emision: datos.fecha_emision,
        monto_parcial: datos.monto,
        id_gasto: gasto.id_gasto,
      })
      .select()
      .single()

    if (facturaError) {
      await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
      if (facturaError.code === '23505')
        return res.status(400).json({ error: `La factura número ${datos.numero_factura} ya fue registrada anteriormente` })
      return res.status(500).json({ error: facturaError.message })
    }

    // Detalles
    if (datos.detalle && datos.detalle.length > 0) {
      const detalles = datos.detalle.map((d) => ({
        nombre_producto: d.nombre_producto,
        cantidad: d.cantidad,
        precio: d.precio,
        id_factura: facturaData.id_factura,
      }))

      const { error: detalleError } = await supabase.from('Detalle_Factura').insert(detalles)
      if (detalleError) {
        await supabase.from('Factura').delete().eq('id_factura', facturaData.id_factura)
        await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
        return res.status(500).json({ error: detalleError.message })
      }
    }

    // Siempre re-evaluar el viaje completo después de guardar
    try {
      await actualizarAlcoholEnViaje(datos.id_viaje)
    } catch (e) {
      console.warn('[alcohol] Error re-evaluando viaje:', e.message)
    }

    // Impuestos
    if (datos.iva && datos.iva > 0) {
      const porcentaje = datos.monto > 0 ? parseFloat(((datos.iva / datos.monto) * 100).toFixed(2)) : 0
      const nombreIva = `IVA ${porcentaje}%`
      let id_impuesto = null

      const { data: impuestoExistente } = await supabase
        .from('Impuesto')
        .select('id_impuesto')
        .eq('porcentaje', porcentaje)
        .single()
      if (impuestoExistente) {
        id_impuesto = impuestoExistente.id_impuesto
      } else {
        const { data: nuevoImpuesto, error: impuestoError } = await supabase
          .from('Impuesto')
          .insert({ nombre: nombreIva, porcentaje })
          .select()
          .single()
        if (!impuestoError) id_impuesto = nuevoImpuesto.id_impuesto
      }

      if (id_impuesto)
        await supabase.from('Factura_Impuestos').insert({ id_factura: facturaData.id_factura, id_impuesto })
    }

    // Imagen
    if (req.file) {
      const extension = req.file.originalname.split('.').pop()
      const fileName = `facturas/${gasto.id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage
        .from('facturas')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto: gasto.id_gasto })
      }
    }

    return res.json({ message: 'Factura guardada correctamente', gasto })
  } catch (error) {
    console.log('Error guardando factura:', error.message)
    return res.status(500).json({ error: error.message || 'Error al guardar la factura' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /facturas/:id_gasto/actualizar
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id_gasto/actualizar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)
    const id_gasto = req.params.id_gasto

    if (!datos.proveedor) return res.status(400).json({ error: 'El nombre del proveedor es requerido' })
    if (!datos.fecha_emision) return res.status(400).json({ error: 'La fecha de emisión es requerida' })
    if (!datos.monto_total || isNaN(parseFloat(datos.monto_total)))
      return res.status(400).json({ error: 'El monto total es requerido' })

    // Proveedor
    let id_proveedor = null
    const { data: proveedorExistente } = await supabase
      .from('Proveedor')
      .select('id_proveedor')
      .eq('nombre', datos.proveedor)
      .single()

    if (proveedorExistente) {
      id_proveedor = proveedorExistente.id_proveedor
      if (datos.nit) {
        await supabase
          .from('Proveedor')
          .update({ numero_doc_fiscal: datos.nit, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
          .eq('id_proveedor', proveedorExistente.id_proveedor)
      }
    } else {
      const { data: nuevoProv, error: provError } = await supabase
        .from('Proveedor')
        .insert({
          nombre: datos.proveedor,
          numero_doc_fiscal: datos.nit || null,
          tipo_doc_fiscal: detectarTipoDoc(datos.nit),
        })
        .select()
        .single()
      if (provError) return res.status(500).json({ error: provError.message })
      id_proveedor = nuevoProv?.id_proveedor
    }

    // Gasto
    const { error: gastoError } = await supabase
      .from('Gasto')
      .update({
        monto_total: parseFloat(datos.monto_total),
        fecha_gasto: datos.fecha_emision,
        descripcion: `Factura ${datos.numero_factura} - ${datos.proveedor}`,
        tipo: datos.tipo_doc,
        modificado: true,
        id_proveedor,
      })
      .eq('id_gasto', id_gasto)

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    // Factura y detalles
    const { data: facturaExistente } = await supabase
      .from('Factura')
      .select('id_factura')
      .eq('id_gasto', id_gasto)
      .single()

    if (facturaExistente) {
      await supabase
        .from('Factura')
        .update({
          numero_factura: datos.numero_factura,
          fecha_emision: datos.fecha_emision,
          monto_parcial: datos.monto,
        })
        .eq('id_factura', facturaExistente.id_factura)

      if (datos.detalle && datos.detalle.length > 0) {
        await supabase.from('Detalle_Factura').delete().eq('id_factura', facturaExistente.id_factura)

        const detalles = datos.detalle.map((d) => ({
          nombre_producto: d.nombre_producto,
          cantidad: d.cantidad,
          precio: d.precio,
          id_factura: facturaExistente.id_factura,
        }))

        await supabase.from('Detalle_Factura').insert(detalles)
      }
    }

    // Re-evaluar el viaje completo (independiente de si se cambió el detalle o no)
    if (datos.id_viaje) {
      try {
        await actualizarAlcoholEnViaje(datos.id_viaje)
      } catch (e) {
        console.warn('[alcohol] Error re-evaluando viaje:', e.message)
      }
    }

    // Imagen
    if (req.file && !datos.mantener_imagen) {
      await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)
      const extension = req.file.originalname.split('.').pop()
      const fileName = `facturas/${id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage
        .from('facturas')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto })
      }
    }

    return res.json({ message: 'Factura actualizada correctamente' })
  } catch (error) {
    console.log('Error actualizando factura:', error.message)
    return res.status(500).json({ error: error.message || 'Error al actualizar la factura' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /facturas/:id_gasto
// Elimina el gasto con su factura, detalles e imagen,
// luego re-evalúa el viaje completo para actualizar tiene_alcohol.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id_gasto', authMiddleware, async (req, res) => {
  try {
    const id_gasto = req.params.id_gasto

    // Recuperar id_viaje antes de borrar (lo necesitamos para re-evaluar)
    const { data: gasto, error: gastoFetchError } = await supabase
      .from('Gasto')
      .select('id_viaje')
      .eq('id_gasto', id_gasto)
      .single()

    if (gastoFetchError || !gasto)
      return res.status(404).json({ error: 'Gasto no encontrado' })

    const id_viaje = gasto.id_viaje

    // Obtener factura(s) del gasto
    const { data: facturas } = await supabase
      .from('Factura')
      .select('id_factura')
      .eq('id_gasto', id_gasto)

    if (facturas && facturas.length > 0) {
      const idsFacturas = facturas.map((f) => f.id_factura)

      // Borrar detalles
      await supabase.from('Detalle_Factura').delete().in('id_factura', idsFacturas)
      // Borrar impuestos asociados
      await supabase.from('Factura_Impuestos').delete().in('id_factura', idsFacturas)
      // Borrar facturas
      await supabase.from('Factura').delete().in('id_factura', idsFacturas)
    }

    // Borrar imágenes del gasto
    await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)

    // Borrar el gasto
    const { error: deleteError } = await supabase.from('Gasto').delete().eq('id_gasto', id_gasto)
    if (deleteError) return res.status(500).json({ error: deleteError.message })

    // Re-evaluar el viaje completo: ahora que el gasto ya no existe,
    // actualizarAlcoholEnViaje consultará solo los detalles restantes.
    // Si la factura eliminada era la única con alcohol → false.
    // Si quedan otras con alcohol → true.
    try {
      await actualizarAlcoholEnViaje(id_viaje)
    } catch (e) {
      console.warn('[alcohol] Error re-evaluando viaje tras eliminar:', e.message)
    }

    return res.json({ message: 'Factura eliminada correctamente' })
  } catch (error) {
    console.log('Error eliminando factura:', error.message)
    return res.status(500).json({ error: error.message || 'Error al eliminar la factura' })
  }
})

module.exports = router
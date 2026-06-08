const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const multer = require('multer')
const { actualizarAlcoholEnViaje } = require('../utils/alcoholUtils')

const upload = multer({ storage: multer.memoryStorage() })

router.get('/:id_gasto/detalle', authMiddleware, async (req, res) => {
  try {
    const { id_gasto } = req.params
    const { data, error } = await supabase
      .from('Gasto')
      .select(`
        *,
        Categoria_Gasto(nombre),
        Proveedor(nombre, numero_doc_fiscal, tipo_doc_fiscal),
        Factura(
          id_factura,
          numero_factura,
          fecha_emision,
          monto_parcial,
          Detalle_Factura(nombre_producto, cantidad, precio)
        ),
        Imagen(url_archivo)
      `)
      .eq('id_gasto', id_gasto)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Gasto no encontrado' })

    return res.json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/registrar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)

    if (!datos.id_viaje) return res.status(400).json({ error: 'El viaje es requerido' })
    if (!datos.monto_total || isNaN(parseFloat(datos.monto_total))) return res.status(400).json({ error: 'El monto es requerido' })

    let id_proveedor = null
    if (datos.proveedor) {
      const { data: provExistente } = await supabase.from('Proveedor').select('id_proveedor').eq('nombre', datos.proveedor).single()
      if (provExistente) {
        id_proveedor = provExistente.id_proveedor
      } else {
        const { data: nuevoProv } = await supabase.from('Proveedor').insert({ nombre: datos.proveedor }).select().single()
        id_proveedor = nuevoProv?.id_proveedor
      }
    }

    const { data: gasto, error: gastoError } = await supabase
      .from('Gasto')
      .insert({
        monto_total: parseFloat(datos.monto_total),
        fecha_gasto: datos.fecha_gasto,
        descripcion: datos.descripcion || '',
        tipo: datos.tipo || 'S',
        id_viaje: datos.id_viaje,
        id_categoria: datos.id_categoria_gasto || null,
        id_proveedor,
      })
      .select()
      .single()

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    if (req.file) {
      const extension = req.file.originalname.split('.').pop()
      const fileName = `gastos/${gasto.id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage.from('facturas').upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto: gasto.id_gasto })
      }
    }

    return res.json({ message: 'Gasto registrado correctamente', gasto })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.put('/:id_gasto/actualizar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)
    const { id_gasto } = req.params

    let id_proveedor = null
    if (datos.proveedor) {
      const { data: provExistente } = await supabase.from('Proveedor').select('id_proveedor').eq('nombre', datos.proveedor).single()
      if (provExistente) {
        id_proveedor = provExistente.id_proveedor
      } else {
        const { data: nuevoProv } = await supabase.from('Proveedor').insert({ nombre: datos.proveedor }).select().single()
        id_proveedor = nuevoProv?.id_proveedor
      }
    }

    const { error: gastoError } = await supabase
      .from('Gasto')
      .update({
        monto_total: parseFloat(datos.monto_total),
        fecha_gasto: datos.fecha_gasto,
        descripcion: datos.descripcion || '',
        tipo: datos.tipo || 'S',
        id_categoria: datos.id_categoria_gasto || null,
        id_proveedor,
      })
      .eq('id_gasto', id_gasto)

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    if (!datos.mantener_imagen) {
      await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)
      if (req.file) {
        const extension = req.file.originalname.split('.').pop()
        const fileName = `gastos/${id_gasto}_${Date.now()}.${extension}`
        const { error: storageError } = await supabase.storage.from('facturas').upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
        if (!storageError) {
          const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
          await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto })
        }
      }
    }

    return res.json({ message: 'Gasto actualizado correctamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

router.delete('/:id_gasto', authMiddleware, async (req, res) => {
  try {
    const { id_gasto } = req.params

    const { data: gasto } = await supabase.from('Gasto').select('id_viaje').eq('id_gasto', id_gasto).single()
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' })

    const id_viaje = gasto.id_viaje

    const { data: facturas } = await supabase.from('Factura').select('id_factura').eq('id_gasto', id_gasto)

    if (facturas && facturas.length > 0) {
      const idsFacturas = facturas.map((f) => f.id_factura)
      await supabase.from('Detalle_Factura').delete().in('id_factura', idsFacturas)
      await supabase.from('Factura_Impuestos').delete().in('id_factura', idsFacturas)
      await supabase.from('Factura').delete().in('id_factura', idsFacturas)
    }

    await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)

    const { error: deleteError } = await supabase.from('Gasto').delete().eq('id_gasto', id_gasto)
    if (deleteError) return res.status(500).json({ error: deleteError.message })

    actualizarAlcoholEnViaje(id_viaje).catch((e) => console.warn('Error alcohol al eliminar:', e.message))

    return res.json({ message: 'Gasto eliminado correctamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error al eliminar el gasto' })
  }
})

module.exports = router;
const supabase = require('../../config/supabase')

// Lista todas las imagenes
const getAllImages = async (req, res) => {
  const {data, error} = await supabase.from('Imagen').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea una nueva imagen
const createImage = async (req, res) => {
  const {data, error} = await supabase.from('Imagen').insert(req.body).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza una imagen existente
const updateImage = async (req, res) => {
  const {data, error} = await supabase.from('Imagen').update(req.body).eq('id_imagen', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina una imagen existente
const deleteImage = async (req, res) => {
  const {data, error} = await supabase.from('Imagen').delete().eq('id_imagen', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllImages, createImage, updateImage, deleteImage};
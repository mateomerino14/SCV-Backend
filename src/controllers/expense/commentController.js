const supabase = require('../../config/supabase')
const commentModerationService = require('../../services/shared/commentModerationService')

// Lista todos los comentarios
const getAllComments = async (req, res) => {
  const {data, error} = await supabase.from('Comentario').select('*')
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Actualiza un comentario existente, validando que no contenga palabras inapropiadas
const updateComment = async (req, res) => {
  const description = req.body.descripcion
  if (commentModerationService.containsForbiddenWords(description)) {
    return res.status(400).json({error: 'El comentario contiene palabras inapropiadas'})
  }
  const updatedComment = {
    descripcion: description,
    fecha: new Date().toISOString(),
  }
  const {data, error} = await supabase.from('Comentario').update(updatedComment).eq('id_comentario', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Crea un nuevo comentario, validando que no contenga palabras inapropiadas
const createComment = async (req, res) => {
  const newComment = {
    descripcion: req.body.descripcion,
    fecha: new Date().toISOString(),
    id_usuario: req.body.id_usuario,
    id_viaje: req.body.id_viaje,
    tipo: 'OBSERVACION',
  }
  if (commentModerationService.containsForbiddenWords(newComment.descripcion)) {
    return res.status(400).json({error: 'El comentario contiene palabras inapropiadas'})
  }
  const {data, error} = await supabase.from('Comentario').insert(newComment).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

// Elimina un comentario existente
const deleteComment = async (req, res) => {
  const {data, error} = await supabase.from('Comentario').delete().eq('id_comentario', req.params.id).select()
  if (error) {
    return res.status(500).json({error: error.message})
  }
  else {
    return res.json(data)
  }
};

module.exports = {getAllComments, updateComment, createComment, deleteComment};
const express= require('express');
const router=express.Router();
const supabase=require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/revisar');




//FUNCIONES AUXILIARES 

const malasPalabras=require('../utils/palabrasProhibidas');
function contieneMalasPalabras(texto){
    const textoLimpio=texto.replace(/[.,!?;:]/g, '').toLowerCase();
    const palabras=textoLimpio.split(' ');
    for(const palabra of palabras){
        if(malasPalabras.includes(palabra)){
            return true;
        }
    }
    return false;
}


//ENDPOINTS
router.get('/',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Comentario').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

//ACTUALIZAR UN COMENTARIO
router.put('/:id',authMiddleware,roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']),async(req,res)=>{
    const descripcion = req.body.descripcion;
    const comentarioActualizado={
        descripcion:descripcion,
        fecha:new Date().toISOString()

    }
    if(contieneMalasPalabras(comentarioActualizado.descripcion)){
        return res.status(400).json({error: 'El comentario contiene palabras inapropiadas'});
    }
    const{data,error}=await supabase.from('Comentario').update(comentarioActualizado).eq('id_comentario',req.params.id).select();    
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


//REGISTRAR UN COMENTARIO
router.post('/',authMiddleware,roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']),async(req,res)=>{
    const comentarioNuevo={
     descripcion:req.body.descripcion,
     fecha:new Date().toISOString(),
     id_usuario:req.body.id_usuario,
     id_viaje:req.body.id_viaje
    }
    if(contieneMalasPalabras(comentarioNuevo.descripcion)){
        return res.status(400).json({error: 'El comentario contiene palabras inapropiadas'});
    }
    const{data,error}=await supabase.from('Comentario').insert(comentarioNuevo).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.delete('/:id',authMiddleware,roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']),async(req,res)=>{
    const{data,error}=await supabase.from('Comentario').delete().eq('id_comentario',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }   
    return res.json(data);
});

module.exports=router;

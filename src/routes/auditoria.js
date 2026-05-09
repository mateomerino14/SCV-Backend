const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleAuth');


router.get( '/', authMiddleware,roleMiddleware(['ADMINISTRADOR']), async (req,res) =>{
    const {data,error} = await supabase.from('Auditoria').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


// //ACTIALIZAR UN REGISTRO
// router.put('/:id', async (req,res) =>{
//     const {data,error} = await supabase.from('Auditoria').update(req.body).eq('id_auditoria',req.params.id).select();
//     if(error){
//         return res.status(500).json({error: error.message});
//     }
//     return res.json(data);
// });


//AGREGAR UN NUEVO REGISTRO
router.post('/', authMiddleware,async (req,res) =>{
    const {data,error} = await supabase.from('Auditoria').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
}); 

router.delete('/:id',async (req,res) =>{
    const {data,error} = await supabase.from('Auditoria').delete().eq('id_auditoria',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data); 
});


module.exports = router;
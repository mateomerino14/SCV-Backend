const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleAuth');

//CON SEGURIDAD, SOLO ADMIN PUEDE HACER ESTAS OPERACIONES, SE DEBE INICIAR SESION PARA OBTENER EL TOKEN Y EN
//authMiddleware,roleMiddleware(['ADMINISTRADOR'])
router.get('/',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    const {data,error}=await supabase.from('Usuario').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    if(req.body.contrasenia){
        req.body.contrasenia=bcrypt.hashSync(req.body.contrasenia,saltRounds);
    }
    const{data,error}=await supabase.from('Usuario').update(req.body).eq('id_usuario',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.post('/',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    if(req.body.contrasenia){
        req.body.contrasenia=bcrypt.hashSync(req.body.contrasenia,saltRounds);
    }
    const {data,error}=await supabase.from('Usuario').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.delete('/:id',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    const{data,error}=await supabase.from('Usuario').delete().eq('id_usuario',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;
const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const router=require('express').Router();
const supabase=require('../config/supabase');

router.post('/',async(req,res)=>{
    const {email_corporativo,contrasenia} = req.body;
    const {data,error}=await supabase.from('Usuario').select('*').eq('email_corporativo',email_corporativo).single();
    if(error || !data){
        return res.status(401).json({error: 'Usuario no encontrado'});
    } 
    if(!await bcrypt.compare(contrasenia,data.contrasenia)){
        return res.status(401).json({error: 'Contraseña incorrecta'});
    }
    const token=jwt.sign({id_usuario:data.id_usuario,email_corporativo:data.email_corporativo,id_rol:data.id_rol},process.env.JWT_SECRET,{expiresIn:'1h'});
    return res.json({token});
});

module.exports=router;

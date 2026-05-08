const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const router=require('express').Router();
const supabase=require('../config/supabase');

router.post('/login',async(req,res)=>{
    const {email,password} = req.body;
    const {data,error}=await supabase.from('Usuario').select('*').eq('email',email).single();
    if(error || !data){
        return res.status(401).json({error: 'Usuario no encontrado'});
    } 
    if(!await bcrypt.compare(password,data.password)){
        return res.status(401).json({error: 'Contraseña incorrecta'});
    }
    const token=jwt.sign({id:data.id_usuario,email:data.email},process.env.JWT_SECRET,{expiresIn:'1h'});
    return res.json({token});
});

module.exports=router;

const supabase=require('../config/supabase');

const revisarRol=(rolesPermitidos)=>{
    return async (req,res,next)=>{
        const {data,error}=await supabase.from('Rol').select('nombre').eq('id_rol',req.user.id_rol).single();
        if(rolesPermitidos.includes(data.nombre)){  
            next();
        }
        else{
            return res.status(402).json({error: 'Acceso denegado, rol no permitido'});
        }
    }
}

module.exports=revisarRol;
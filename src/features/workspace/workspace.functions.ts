import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { documentSchema, type Document } from './domain';
import { z } from 'zod';
export const getWorkspace = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const db=context.supabase;
 const profileResult=await db.from('profiles').select('*').eq('id',context.userId).single();
 if(profileResult.error) throw new Error('Não foi possível carregar seu perfil.');
 const profile=profileResult.data;
 if(!profile.unit_id) return {profile,unit:null,role:null,documents:[] as Document[],members:[],roles:[],movements:[]};
 const [unit,role,members,roles,movements]=await Promise.all([db.from('units').select('*').eq('id',profile.unit_id).single(),db.from('user_roles').select('role').eq('user_id',context.userId).single(),db.from('profiles').select('*').eq('unit_id',profile.unit_id),db.from('user_roles').select('*').eq('unit_id',profile.unit_id),db.from('document_movements').select('*').order('created_at',{ascending:false}).limit(6)]);
 for(const result of [unit,role,members,roles,movements]) if(result.error) throw new Error('Não foi possível carregar os dados da unidade.');
 const documents: Document[]=[];
 for(let offset=0;;offset+=1000){ const r=await db.from('documents').select('*').eq('unit_id',profile.unit_id).order('created_at',{ascending:false}).order('id').range(offset,offset+999); if(r.error)throw new Error('Não foi possível carregar os documentos.'); documents.push(...r.data); if(r.data.length<1000)break; }
 return {profile,unit:unit.data,role:role.data?.role??null,documents,members:members.data??[],roles:roles.data??[],movements:movements.data??[]};
});
export const saveDocument=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>documentSchema.parse(input)).handler(async({data,context})=>{
 const {data:profile}=await context.supabase.from('profiles').select('unit_id').eq('id',context.userId).single();
 if(!profile?.unit_id) throw new Error('Sua conta ainda não está vinculada a uma unidade.');
 const {id,...fields}=data;
 const result=id ? await context.supabase.from('documents').update(fields).eq('id',id).select('id').single() : await context.supabase.from('documents').insert({...fields,unit_id:profile.unit_id,created_by:context.userId}).select('id').single();
 if(result.error) throw new Error(result.error.code==='23505'?'Este número de controle já existe.':'Não foi possível salvar. Verifique os campos e sua permissão.');
 return result.data;
});
export const initializeUnit=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({name:z.string().trim().min(2).max(120)}).parse(input)).handler(async({data,context})=>{const r=await context.supabase.rpc('initialize_unit',{unit_name:data.name});if(r.error)throw new Error(r.error.message);return r.data;});
export const assignMember=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({email:z.email(),role:z.enum(['administrador','chefe','operador','consulta'])}).parse(input)).handler(async({data,context})=>{const r=await context.supabase.rpc('assign_member',{member_email:data.email,member_role:data.role});if(r.error)throw new Error(r.error.message);return {success:true};});

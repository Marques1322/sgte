import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { documentSchema, fatdStageDeadlinesSchema, type Document, type FatdStageDeadline } from './domain';
import { z } from 'zod';
export const getWorkspace = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const db=context.supabase;
 const profileResult=await db.from('profiles').select('*').eq('id',context.userId).single();
 if(profileResult.error) throw new Error('Não foi possível carregar seu perfil.');
 const profile=profileResult.data;
 if(!profile.unit_id) return {profile,unit:null,role:null,documents:[] as Document[],fatdStageDeadlines:[] as FatdStageDeadline[],members:[],roles:[],movements:[]};
 const [unit,role,members,roles,movements,fatdStageDeadlines]=await Promise.all([db.from('units').select('*').eq('id',profile.unit_id).single(),db.from('user_roles').select('role').eq('user_id',context.userId).single(),db.from('profiles').select('*').eq('unit_id',profile.unit_id),db.from('user_roles').select('*').eq('unit_id',profile.unit_id),db.from('document_movements').select('*').order('created_at',{ascending:false}).limit(6),db.from('fatd_stage_deadlines').select('*').eq('unit_id',profile.unit_id).order('due_date',{ascending:true}).order('stage')]);
 for(const result of [unit,role,members,roles,movements,fatdStageDeadlines]) if(result.error) throw new Error('Não foi possível carregar os dados da unidade.');
 const documents: Document[]=[];
 for(let offset=0;;offset+=1000){ const r=await db.from('documents').select('*').eq('unit_id',profile.unit_id).order('created_at',{ascending:false}).order('id').range(offset,offset+999); if(r.error)throw new Error('Não foi possível carregar os documentos.'); documents.push(...r.data); if(r.data.length<1000)break; }
 return {profile,unit:unit.data,role:role.data?.role??null,documents,fatdStageDeadlines:fatdStageDeadlines.data??[],members:members.data??[],roles:roles.data??[],movements:movements.data??[]};
});
export const saveDocument=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>documentSchema.parse(input)).handler(async({data,context})=>{
 const {data:profile}=await context.supabase.from('profiles').select('unit_id').eq('id',context.userId).single();
 if(!profile?.unit_id) throw new Error('Sua conta ainda não está vinculada a uma unidade.');
 const {id,...fields}=data;
 const result=id ? await context.supabase.from('documents').update(fields).eq('id',id).select('id').single() : await context.supabase.from('documents').insert({...fields,unit_id:profile.unit_id,created_by:context.userId}).select('id').single();
 if(result.error) throw new Error(result.error.code==='23505'?'Este número de controle já existe.':'Não foi possível salvar. Verifique os campos e sua permissão.');
 return result.data;
});
export const saveFatdStageDeadlines=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>fatdStageDeadlinesSchema.parse(input)).handler(async({data,context})=>{
 const db=context.supabase;
 const profileResult=await db.from('profiles').select('unit_id').eq('id',context.userId).single();
 if(profileResult.error||!profileResult.data?.unit_id) throw new Error('Sua conta ainda não está vinculada a uma unidade.');
 const unitId=profileResult.data.unit_id;
 const roleResult=await db.from('user_roles').select('role').eq('user_id',context.userId).eq('unit_id',unitId).single();
 if(roleResult.error||!roleResult.data||roleResult.data.role==='consulta') throw new Error('Seu perfil não tem permissão para alterar prazos de FATD.');
 const documentResult=await db.from('documents').select('id').eq('id',data.document_id).eq('unit_id',unitId).eq('type_code','fatd').maybeSingle();
 if(documentResult.error) throw new Error('Não foi possível validar a FATD na sua unidade.');
 if(!documentResult.data) throw new Error('A FATD não foi encontrada na sua unidade.');
 const existingResult=await db.from('fatd_stage_deadlines').select('stage,created_by').eq('document_id',data.document_id).eq('unit_id',unitId);
 if(existingResult.error) throw new Error('Não foi possível consultar os prazos atuais da FATD.');
 const authors=new Map<string,string>();
 for(const stage of existingResult.data) authors.set(stage.stage,stage.created_by);
 const rows=data.stages.map(stage=>({...stage,unit_id:unitId,document_id:data.document_id,created_by:authors.get(stage.stage)??context.userId}));
 const result=await db.from('fatd_stage_deadlines').upsert(rows,{onConflict:'document_id,stage'}).select('*');
 if(result.error) throw new Error('Não foi possível salvar os prazos da FATD. Verifique sua permissão e tente novamente.');
 return result.data;
});
export const initializeUnit=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({name:z.string().trim().min(2).max(120)}).parse(input)).handler(async({data,context})=>{const r=await context.supabase.rpc('initialize_unit',{unit_name:data.name});if(r.error)throw new Error(r.error.message);return r.data;});
export const assignMember=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({email:z.email(),role:z.enum(['administrador','chefe','operador','consulta'])}).parse(input)).handler(async({data,context})=>{const r=await context.supabase.rpc('assign_member',{member_email:data.email,member_role:data.role});if(r.error)throw new Error(r.error.message);return {success:true};});

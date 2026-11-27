import { z } from 'zod';
import type { Tables, Enums } from '@/integrations/supabase/types';
export type Document = Tables<'documents'>;
export type FatdStageDeadline = Tables<'fatd_stage_deadlines'>;
export type Role = Enums<'app_role'>;
export const types = [{code:'fatd',name:'FATD'},{code:'notas',name:'Notas'},{code:'partes',name:'Partes'},{code:'diex',name:'DIEx'},{code:'oficios',name:'Ofícios'},{code:'sindicancias',name:'Sindicâncias'},{code:'boletins',name:'Boletins'},{code:'processos',name:'Processos Administrativos'}];
export const fatdStages = [{code:'defesa',label:'Defesa do militar'},{code:'revisao_cmt_companhia',label:'Revisão do comandante de companhia'},{code:'julgamento',label:'Julgamento'}] as const;
export type FatdStageCode = typeof fatdStages[number]['code'];
export const roleLabels: Record<Role,string> = {administrador:'Administrador',chefe:'Chefe',operador:'Operador',consulta:'Consulta'};
export function canWrite(role: Role | null) { return role !== null && role !== 'consulta'; }
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function documentState(d: Pick<Document,'status'|'due_date'>, date=today()) {
 if(d.status==='concluido') return 'concluido';
 if(d.due_date && d.due_date<date) return 'atrasado';
 const end = new Date(`${date}T12:00:00`); end.setDate(end.getDate()+7);
 const limit = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
 if(d.due_date && d.due_date<=limit) return 'proximo';
 return d.status;
}
export const stateLabels: Record<string,string> = {pendente:'Pendente',em_andamento:'Em andamento',concluido:'Concluído',atrasado:'Atrasado',proximo:'Prazo próximo'};
export function stats(docs: Document[]) { return {fatd:docs.filter(d=>d.type_code==='fatd'&&d.status!=='concluido').length,pendentes:docs.filter(d=>d.status==='pendente').length,proximos:docs.filter(d=>documentState(d)==='proximo').length,atrasados:docs.filter(d=>documentState(d)==='atrasado').length,concluidos:docs.filter(d=>d.status==='concluido').length}; }
export function dateLabel(value:string|null) { return value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'; }
export const documentSchema = z.object({id:z.string().uuid().optional(),type_code:z.enum(['fatd','notas','partes','diex','oficios','sindicancias','boletins','processos']),control_number:z.string().trim().min(1).max(80),origin_number:z.string().max(120),subject:z.string().trim().min(3).max(500),received_date:z.iso.date(),due_date:z.iso.date().nullable(),responsible_id:z.string().uuid().nullable(),origin_sector:z.string().max(120),destination_sector:z.string().max(120),status:z.enum(['pendente','em_andamento','concluido']),priority:z.enum(['normal','alta','urgente']),notes:z.string().max(5000)}).refine(d=>!d.due_date||d.due_date>=d.received_date,{message:'O prazo não pode ser anterior ao recebimento.'});
const fatdStageEntrySchema = z.object({
 stage:z.enum(['defesa','revisao_cmt_companhia','julgamento']),
 due_date:z.iso.date().nullable(),
 status:z.enum(['pendente','concluido']),
 completed_date:z.iso.date().nullable(),
}).superRefine((stage,ctx)=>{
 if(stage.status==='concluido'&&!stage.completed_date)ctx.addIssue({code:'custom',path:['completed_date'],message:'Informe a data de conclusão da etapa.'});
 if(stage.status==='pendente'&&stage.completed_date)ctx.addIssue({code:'custom',path:['completed_date'],message:'Etapas pendentes não podem ter data de conclusão.'});
});
export const fatdStageDeadlinesSchema = z.object({
 document_id:z.string().uuid(),
 stages:z.array(fatdStageEntrySchema).length(3),
}).superRefine(({stages},ctx)=>{
 if(new Set(stages.map(stage=>stage.stage)).size!==3)ctx.addIssue({code:'custom',path:['stages'],message:'Informe cada etapa da FATD uma única vez.'});
});

import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {UserPlus,Users as UsersIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {roleLabels,canWrite} from './domain';
import type {Workspace} from './queries';
import {assignMember} from './workspace.functions';
import {SetupUnit} from './setup-unit';
import {Shell,SectionTitle} from './shell';

export function UsersPage({workspace}:{workspace:Workspace}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const cache=useQueryClient();
  if (!workspace.unit) return <SetupUnit workspace={workspace}/>;
  const writable=workspace.role==='administrador';
  return (
    <Shell workspace={workspace} title="Usuários">
      <SectionTitle title="Usuários" description="Perfis vinculados à unidade e seus níveis de acesso."/>
      {writable&&<form className="panel mb-6 p-5" onSubmit={async e=>{
        e.preventDefault();setBusy(true);setError('');
        const form=new FormData(e.currentTarget);
        try{
          await assignMember({data:{email:String(form.get('email')),role:String(form.get('role')) as 'administrador'|'chefe'|'operador'|'consulta'}});
          await cache.invalidateQueries({queryKey:['workspace']});
          toast.success('Usuário vinculado à unidade.');
          e.currentTarget.reset();
        }catch(e){setError(e instanceof Error?e.message:'Não foi possível vincular o usuário.');}
        finally{setBusy(false);}
      }}>
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold"><UserPlus className="size-4 text-primary"/>Vincular usuário</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
          <div className="form-field"><label htmlFor="email">E-mail</label><input className="field" id="email" name="email" type="email" required/></div>
          <div className="form-field"><label htmlFor="role">Perfil</label><select className="field" id="role" name="role" defaultValue="operador"><option value="administrador">Administrador</option><option value="chefe">Chefe</option><option value="operador">Operador</option><option value="consulta">Consulta</option></select></div>
          <div className="flex items-end"><Button type="submit" disabled={busy||!canWrite(workspace.role)}>{busy?'Vinculando…':'Vincular'}</Button></div>
        </div>
        {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </form>}
      <section className="panel"><div className="panel-heading"><div className="flex items-center gap-2"><UsersIcon className="size-4 text-primary"/><h2>Membros da unidade</h2></div><span className="text-xs text-muted-foreground">{workspace.members.length} usuário(s)</span></div>
        {workspace.members.length?<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th></tr></thead><tbody>{workspace.members.map(member=>{
          const role=workspace.roles.find(r=>r.user_id===member.id)?.role;
          return <tr key={member.id}><td className="font-semibold">{member.display_name||'Sem nome'}</td><td>{member.email}</td><td>{role?roleLabels[role]:workspace.profile.id===member.id&&workspace.role?roleLabels[workspace.role]:'Consulta'}</td></tr>
        })}</tbody></table></div>:<div className="empty-state"><p className="font-semibold">Nenhum membro encontrado</p></div>}
      </section>
    </Shell>
  );
}

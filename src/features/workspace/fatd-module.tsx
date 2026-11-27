import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ClipboardList, FilePlus2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { canWrite, dateLabel, documentState, fatdStageDeadlinesSchema, fatdStages, stateLabels, type Document, type FatdStageDeadline } from './domain';
import { SetupUnit } from './setup-unit';
import { SectionTitle, Shell } from './shell';
import type { Workspace } from './queries';
import { saveFatdStageDeadlines } from './workspace.functions';

function FatdStageEditor({ document, deadlines, editable }: { document: Document; deadlines: FatdStageDeadline[]; editable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();

  return (
    <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setError('');
      const formData = new FormData(event.currentTarget);
      try {
        const data = fatdStageDeadlinesSchema.parse({
          document_id: document.id,
          stages: fatdStages.map(stage => {
            const status = String(formData.get(`status-${stage.code}`) ?? 'pendente');
            return {
              stage: stage.code,
              status,
              due_date: String(formData.get(`due-${stage.code}`) ?? '') || null,
              completed_date: status === 'concluido' ? String(formData.get(`completed-${stage.code}`) ?? '') || null : null,
            };
          }),
        });
        await saveFatdStageDeadlines({ data });
        await cache.invalidateQueries({ queryKey: ['workspace'] });
        toast.success('Prazos da FATD salvos.');
      } catch (saveError) {
        setError(saveError instanceof Error && !saveError.message.startsWith('[')
          ? saveError.message
          : 'Verifique as situações e as datas de conclusão informadas.');
      } finally {
        setBusy(false);
      }
    }}>
      <fieldset disabled={!editable || busy}>
        <div className="grid gap-3 lg:grid-cols-3">
          {fatdStages.map(stage => {
            const existing = deadlines.find(deadline => deadline.stage === stage.code);
            const prefix = `${document.id}-${stage.code}`;
            return (
              <section key={stage.code} className="rounded-md border border-border bg-background p-4">
                <h3 className="mb-4 text-sm font-bold">{stage.label}</h3>
                <div className="space-y-3">
                  <div className="form-field">
                    <label htmlFor={`due-${prefix}`}>Prazo final (manual)</label>
                    <input id={`due-${prefix}`} name={`due-${stage.code}`} type="date" className="field" defaultValue={existing?.due_date ?? ''}/>
                  </div>
                  <div className="form-field">
                    <label htmlFor={`status-${prefix}`}>Situação</label>
                    <select id={`status-${prefix}`} name={`status-${stage.code}`} className="field" defaultValue={existing?.status ?? 'pendente'}>
                      <option value="pendente">Pendente</option>
                      <option value="concluido">Concluída</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor={`completed-${prefix}`}>Data de conclusão</label>
                    <input id={`completed-${prefix}`} name={`completed-${stage.code}`} type="date" className="field" defaultValue={existing?.completed_date ?? ''}/>
                    <p className="text-[11px] leading-4 text-muted-foreground">Preencha somente quando a etapa estiver concluída.</p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {editable && <div className="mt-4 flex justify-end"><Button type="submit" disabled={busy}><Save/>{busy ? 'Salvando…' : 'Salvar prazos'}</Button></div>}
    </form>
  );
}

function FatdCard({ document, deadlines, editable }: { document: Document; deadlines: FatdStageDeadline[]; editable: boolean }) {
  const revision = deadlines.map(deadline => `${deadline.stage}:${deadline.updated_at}`).sort().join('|') || 'empty';
  const state = documentState(document);

  return (
    <article className="panel p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{document.control_number}</h2>
            <span className={`status ${state}`}>{stateLabels[state]}</span>
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{document.subject}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Recebida em {dateLabel(document.received_date)} · Origem {document.origin_number || 'não informada'}
          </p>
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/documentos/$id" params={{ id: document.id }}>Abrir cadastro central</Link></Button>
      </div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="size-4 text-primary"/>Datas informadas manualmente; prazos legais não são calculados.</div>
      <FatdStageEditor key={`${document.id}-${revision}`} document={document} deadlines={deadlines} editable={editable}/>
    </article>
  );
}

export function FatdModule({ workspace }: { workspace: Workspace }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const [page, setPage] = useState(0);
  if (!workspace.unit) return <SetupUnit workspace={workspace}/>;

  const fatds = workspace.documents
    .filter(document => document.type_code === 'fatd')
    .filter(document => filter === 'todos' || (filter === 'concluidos' ? document.status === 'concluido' : document.status !== 'concluido'))
    .filter(document => `${document.control_number} ${document.origin_number} ${document.subject}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(fatds.length / 10));
  const currentPage = Math.min(page, pages - 1);
  const editable = canWrite(workspace.role);

  return (
    <Shell workspace={workspace} title="FATD">
      <SectionTitle
        title="FATD"
        description="Acompanhe as etapas de defesa, revisão do comandante de companhia e julgamento."
        action={editable && <Button asChild><Link to="/documentos/novo" search={{ tipo: 'fatd' }}><FilePlus2/>Cadastrar FATD</Link></Button>}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary/45 px-4 py-3">
        <div className="flex items-center gap-2 text-sm"><ClipboardList className="size-4 text-primary"/><span><strong>{fatds.length}</strong> FATD(s) nesta lista</span></div>
        <p className="text-xs text-muted-foreground">Inclui registros históricos e em andamento.</p>
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground"/>
          <input className="field pl-9" aria-label="Pesquisar FATDs" placeholder="Pesquisar número ou assunto..." value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/>
        </div>
        <select className="field w-auto" aria-label="Filtrar FATDs por situação" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>
          <option value="todos">Todas as FATDs</option>
          <option value="ativos">Em andamento</option>
          <option value="concluidos">Concluídas / históricas</option>
        </select>
      </div>
      {fatds.length ? (
        <div className="space-y-4">
          {fatds.slice(currentPage * 10, currentPage * 10 + 10).map(document => (
            <FatdCard
              key={document.id}
              document={document}
              deadlines={workspace.fatdStageDeadlines.filter(deadline => deadline.document_id === document.id)}
              editable={editable}
            />
          ))}
          {pages > 1 && <div className="flex items-center justify-between border-t border-border py-3 text-xs text-muted-foreground">
            <span>Página {currentPage + 1} de {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button>
            </div>
          </div>}
        </div>
      ) : (
        <section className="panel">
          <div className="empty-state min-h-[320px]">
            <div className="empty-icon"><ClipboardList className="size-6"/></div>
            <h2 className="text-lg font-bold">{workspace.documents.some(document => document.type_code === 'fatd') ? 'Nenhuma FATD encontrada' : 'Nenhuma FATD cadastrada'}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {workspace.documents.some(document => document.type_code === 'fatd')
                ? 'Ajuste a pesquisa ou o filtro para localizar um registro.'
                : 'Cadastre a FATD no registro central e informe aqui os prazos manuais de cada etapa.'}
            </p>
            {editable && !workspace.documents.some(document => document.type_code === 'fatd') && <Button asChild className="mt-5"><Link to="/documentos/novo" search={{ tipo: 'fatd' }}><FilePlus2/>Cadastrar FATD</Link></Button>}
          </div>
        </section>
      )}
    </Shell>
  );
}

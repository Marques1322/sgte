import {CalendarClock,Construction} from 'lucide-react';
import {Link} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
import {SetupUnit} from './setup-unit';
import {Shell,SectionTitle} from './shell';
import type {Workspace} from './queries';

export function PlannedModule({workspace,title,description}:{workspace:Workspace;title:string;description:string}) {
  if (!workspace.unit) return <SetupUnit workspace={workspace}/>;
  return (
    <Shell workspace={workspace} title={title}>
      <SectionTitle title={title} description={description}/>
      <section className="panel">
        <div className="empty-state min-h-[390px]">
          <div className="empty-icon"><Construction className="size-6"/></div>
          <h2 className="text-lg font-bold">Módulo previsto para a próxima etapa</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Esta área já está organizada no sistema. O fluxo específico de {title} será implementado em uma etapa futura.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button asChild><Link to="/documentos"><CalendarClock/>Abrir documentos</Link></Button>
            <Button asChild variant="outline"><Link to="/agenda">Consultar prazos</Link></Button>
          </div>
        </div>
      </section>
    </Shell>
  );
}

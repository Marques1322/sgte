import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {FatdModule} from '@/features/workspace/fatd-module';
import {workspaceOptions} from '@/features/workspace/queries';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/fatd')({
  head:()=>pageHead('FATD','Controle das etapas e prazos de procedimentos disciplinares.'),
  loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),
  component:Page,
});

function Page(){
  const {data}=useSuspenseQuery(workspaceOptions);
  return <FatdModule workspace={data}/>;
}

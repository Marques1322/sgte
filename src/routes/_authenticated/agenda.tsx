import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {DocumentsList} from '@/features/workspace/documents-list';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/agenda')({head:()=>pageHead('Agenda de Prazos','Prazos dos documentos em aberto.'),loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),component:Page});
function Page(){const {data}=useSuspenseQuery(workspaceOptions);return <DocumentsList workspace={data} agenda/>}

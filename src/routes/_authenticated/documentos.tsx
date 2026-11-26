import {createFileRoute} from '@tanstack/react-router';
import {z} from 'zod';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {DocumentsList} from '@/features/workspace/documents-list';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/documentos')({
  validateSearch:z.object({situacao:z.string().optional(),tipo:z.string().optional()}),
  head:()=>pageHead('Documentos','Cadastro central e acompanhamento dos documentos da unidade.'),
  loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),
  component:Page,
});

function Page(){const {data}=useSuspenseQuery(workspaceOptions);const search=Route.useSearch();return <DocumentsList workspace={data} initialState={search.situacao}/>}

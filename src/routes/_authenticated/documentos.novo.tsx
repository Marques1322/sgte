import {createFileRoute} from '@tanstack/react-router';
import {z} from 'zod';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {DocumentEditor} from '@/features/workspace/document-editor';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/documentos/novo')({
  validateSearch:z.object({tipo:z.string().optional()}),
  head:()=>pageHead('Novo documento','Cadastro de documento da unidade.'),
  loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),
  component:Page,
});

function Page(){const {data}=useSuspenseQuery(workspaceOptions);const search=Route.useSearch();return <DocumentEditor workspace={data} type={search.tipo}/>}

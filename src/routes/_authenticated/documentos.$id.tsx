import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {DocumentEditor} from '@/features/workspace/document-editor';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/documentos/$id')({
  head:()=>pageHead('Documento','Visualização e edição do documento.'),
  loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),
  component:Page,
});

function Page(){const {data}=useSuspenseQuery(workspaceOptions);const {id}=Route.useParams();return <DocumentEditor workspace={data} document={data.documents.find(d=>d.id===id)}/>}

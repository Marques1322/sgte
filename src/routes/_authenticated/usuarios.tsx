import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {UsersPage} from '@/features/workspace/users-page';
import {pageHead} from '@/features/workspace/meta';

export const Route=createFileRoute('/_authenticated/usuarios')({head:()=>pageHead('Usuários','Perfis e permissões da unidade.'),loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),component:Page});
function Page(){const {data}=useSuspenseQuery(workspaceOptions);return <UsersPage workspace={data}/>}

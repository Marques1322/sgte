import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {workspaceOptions} from '@/features/workspace/queries';
import {Dashboard} from '@/features/workspace/dashboard';
import {SetupUnit} from '@/features/workspace/setup-unit';
import {pageHead} from '@/features/workspace/meta';
export const Route=createFileRoute('/_authenticated/dashboard')({head:()=>pageHead('Dashboard','Indicadores e acompanhamento dos documentos da unidade.'),loader:({context})=>context.queryClient.ensureQueryData(workspaceOptions),component:Page});
function Page(){const {data}=useSuspenseQuery(workspaceOptions);return data.unit?<Dashboard workspace={data}/>:<SetupUnit workspace={data}/>;}

import { queryOptions } from '@tanstack/react-query';
import { getWorkspace } from './workspace.functions';
export const workspaceOptions = queryOptions({queryKey:['workspace'],queryFn:()=>getWorkspace(),staleTime:30_000});
export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;

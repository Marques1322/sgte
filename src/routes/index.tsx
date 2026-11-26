import {createFileRoute,useNavigate} from '@tanstack/react-router';
import {useEffect} from 'react';
import {Dashboard} from '@/features/workspace/dashboard';
import {useAccount} from '@/features/workspace/auth-context';
import {pageHead} from '@/features/workspace/meta';
export const Route=createFileRoute('/')({head:()=>pageHead('Painel inicial','Controle institucional de documentos e prazos militares por unidade.'),component:Index});
function Index(){const {user,ready}=useAccount();const navigate=useNavigate();useEffect(()=>{if(ready&&user)navigate({to:'/dashboard',replace:true});},[user,ready,navigate]);return <Dashboard/>;}

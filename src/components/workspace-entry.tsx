'use client';
import dynamic from 'next/dynamic';
const LocalWorkspace=dynamic(()=>import('./workspace').then(module=>module.Workspace),{ssr:false});
const HostedWorkspace=dynamic(()=>import('./cloud-workspace').then(module=>module.CloudWorkspace),{ssr:false});
export function WorkspaceEntry({cloud}:{cloud:boolean}){return cloud?<HostedWorkspace/>:<LocalWorkspace/>;}

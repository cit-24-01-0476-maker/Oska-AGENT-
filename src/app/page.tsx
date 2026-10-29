import {WorkspaceEntry} from '@/components/workspace-entry';
import {isCloud} from '@/lib/runtime';
export const dynamic='force-dynamic';
export default function Page(){return <WorkspaceEntry cloud={isCloud()}/>;}

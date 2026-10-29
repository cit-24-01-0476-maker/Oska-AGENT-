import {AppError} from '@/lib/contracts';
import {isCloud} from '@/lib/runtime';

// Shared Neon OAuth credentials are explicitly a preview identity option.
// This switch never enables model subscriptions or inference.
export function managedAuthEnabled(){return isCloud()&&process.env.OSKA_AUTH_MODE==='neon-preview';}
export function managedAuthConfigured(){return managedAuthEnabled()&&!!process.env.NEON_AUTH_BASE_URL&&!!process.env.AUTH_SECRET&&process.env.AUTH_SECRET.length>=32;}
export async function managedAuth(){
  if(!managedAuthConfigured())throw new AppError('AUTH_SETUP_REQUIRED','Managed preview identity is not configured.',503);
  const {createNeonAuth}=await import('@neondatabase/auth/next/server');
  return createNeonAuth({baseUrl:process.env.NEON_AUTH_BASE_URL!,cookies:{secret:process.env.AUTH_SECRET!,sessionDataTtl:1}});
}

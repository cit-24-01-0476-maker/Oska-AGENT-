'use client';

import dynamic from 'next/dynamic';

// This authenticated local workspace has no SEO requirement. Mount it on the
// client so extensions cannot alter its server HTML before React hydrates it.
const Workspace = dynamic(
  () => import('@/components/workspace').then(module => module.Workspace),
  { ssr: false },
);

export default function Page(){return <Workspace/>;}

import type { ReactNode } from 'react';
import type { SpaView } from '../../types';

export default function SpaViewRouter({ view, views }: { view: SpaView; views: Record<SpaView, ReactNode> }) {
  return <>{views[view]}</>;
}

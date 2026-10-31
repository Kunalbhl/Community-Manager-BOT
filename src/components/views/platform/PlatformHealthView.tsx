import React from 'react';
import { ProductionOperationsView } from '../community/ProductionOperationsView';

interface PlatformHealthViewProps {
  platformKey: string;
}

export const PlatformHealthView: React.FC<PlatformHealthViewProps> = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <ProductionOperationsView />
    </div>
  );
};

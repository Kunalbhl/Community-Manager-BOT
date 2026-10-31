import React from 'react';
import { WorkflowStep, StepState } from './WorkflowStep.js';

export interface TimelineItem {
  id: string;
  title: string;
  subtitle?: string;
  state: StepState;
  requiredRole?: string;
  timestamp?: string;
  onClick?: () => void;
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ items, className = '' }) => {
  return (
    <div className={`flex flex-col ${className}`}>
      {items.map((item, index) => (
        <WorkflowStep
          key={item.id || index}
          stepNumber={index + 1}
          title={item.title}
          subtitle={item.subtitle}
          state={item.state}
          requiredRole={item.requiredRole}
          isLast={index === items.length - 1}
          timestamp={item.timestamp}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
};

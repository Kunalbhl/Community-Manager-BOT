import React from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { Modal } from './Modal.js';
import { ActionButton } from './ActionButton.js';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'primary':
        return <Info className="w-5 h-5 text-[#5865F2]" />;
      default:
        return <AlertCircle className="w-5 h-5 text-rose-500" />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </ActionButton>
          <ActionButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </ActionButton>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
          {getIcon()}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>
      </div>
    </Modal>
  );
};

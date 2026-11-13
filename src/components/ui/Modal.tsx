import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const shell = document.querySelector<HTMLElement>('.app-shell');
    const wasInert = shell?.inert;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('.app-modal-dialog');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]') || [])]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); dialogRef.current?.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (shell) shell.inert = wasInert ?? false;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="app-modal">
      {/* Backdrop */}
      <div
        className="app-modal-backdrop"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-description` : undefined}
        tabIndex={-1}
        className={`app-modal-dialog app-modal-dialog--${size}`}
      >
        {/* Header */}
        <div className="app-modal-header">
          <div>
            <h3 id={titleId} className="app-modal-title">{title}</h3>
            {description && (
              <p id={`${titleId}-description`} className="app-modal-description">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Закрыть диалог"
            onClick={onClose}
            className="app-modal-close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="app-modal-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="app-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>, document.body
  );
};

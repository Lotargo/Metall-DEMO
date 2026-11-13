import React, { useId } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const messageId = `${inputId}-message`;

    return (
      <div className="ui-field">
        {label && (
          <label
            htmlFor={inputId}
            className="ui-input-label"
          >
            {label}
          </label>
        )}
        <div className="ui-field-control">
          {icon && (
            <span className="ui-field-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <input
            {...props}
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={[props['aria-describedby'], (error || helperText) && messageId].filter(Boolean).join(' ') || undefined}
            className={twMerge(
              clsx(
                'ui-input',
                icon && 'ui-input--with-icon',
                className
              )
            )}
          />
        </div>
        {error ? (
          <p id={messageId} className="ui-input-error">{error}</p>
        ) : helperText ? (
          <p id={messageId} className="ui-input-helper">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const messageId = `${selectId}-message`;

    return (
      <div className="ui-field">
        {label && (
          <label
            htmlFor={selectId}
            className="ui-input-label"
          >
            {label}
          </label>
        )}
        <div className="ui-field-control">
          <select
            {...props}
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={[props['aria-describedby'], (error || helperText) && messageId].filter(Boolean).join(' ') || undefined}
            className={twMerge(
              clsx(
                'ui-select',
                className
              )
            )}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="ui-select-option">
                {opt.label}
              </option>
            ))}
          </select>
          <span className="ui-field-chevron" aria-hidden="true">
            <ChevronDown size={15} strokeWidth={1.75} className="ui-select-chevron" />
          </span>
        </div>
        {error ? (
          <p id={messageId} className="ui-input-error">{error}</p>
        ) : helperText ? (
          <p id={messageId} className="ui-input-helper">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';

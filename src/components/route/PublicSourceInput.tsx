import { useState } from 'react';
import { Input, type InputProps } from '@/components/ui/Input';
import { publicSourceText } from '@/utils/publicSource';

type Props = Omit<InputProps, 'value' | 'defaultValue'> & { value?: string | null; defaultValue?: string | null };

/** Readable initial provenance; an unrelated form edit keeps its stored source. */
export function PublicSourceInput({ value, defaultValue, name, onChange, ...props }: Props) {
  const original = value ?? defaultValue ?? '';
  const [edited, setEdited] = useState<{ original: string; display: string }>();
  const current = edited?.original === original ? edited : undefined;
  const display = current?.display ?? publicSourceText(original, original ? 'Основание сохранено' : '');
  const stored = current?.display ?? original;
  return <>
    {name && <input type="hidden" name={name} value={stored} disabled={props.disabled} />}
    <Input {...props} data-source-field="true" value={display} onChange={event => {
      const next = event.target.value;
      setEdited({ original: value === undefined ? original : next, display: next });
      onChange?.(event);
    }} />
  </>;
}

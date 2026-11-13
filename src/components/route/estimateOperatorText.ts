import { formatText } from '@/utils/compactNumbers';

// Source records keep their original audit data in the saved snapshot.
// The operator view accepts human source text, never machine references or log records.
const auditRecord = new RegExp([
  String.raw`\b[a-f0-9]{64}\b|\b(?:cq|ct)_[a-z0-9_-]+`,
  String.raw`\b(?:machine(?:-card)?|machcalc|engineering-estimate|profile|artifact):|\bop:\d+:`,
  String.raw`\b(?:passport|route|stock|confirmation|estimation_settings|calculation_input)\.[a-z_]+|\bgeometry[.\[]`,
  String.raw`\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+/\d+\b`,
  String.raw`Extra inputs are not permitted|\bGo (?:calculation|motion) evidence:`,
  String.raw`\b(?:agent_basis|sha256|input_sha256|request_sha256|work_scope_sha256|source_rows_sha256)\b`,
  String.raw`[A-Z]:[\\/]|(?:^|\s)(?:mvp/|docs/|\.temp/)`,
].join('|'), 'i');

export function estimateOperatorText(value: string): string | null {
  value = value.split(/(https?:\/\/\S+)/gi).map((part, index) => index % 2 ? part : part.replace(/\bm\d+[lr]?\b/g, 'на чертеже')).join('');
  value = value.replace(/Метод [a-z][a-z0-9./-]+ не подключён для этого элемента\./g, 'Расчёт времени этой работы пока не поддерживается.')
    .replace(/material_state=preserve/gi, 'сохранении состояния материала')
    .replace(/material_state/gi, 'состояние материала').replace(/blank_geometry_evidence/gi, 'проверка геометрии заготовки')
    .replace(/\bsnapshot\b/gi, 'сохранённые данные').replace(/\bunknown\b/gi, 'неизвестно')
    .replace(/drawing_full\.png|source_render\.png/gi, 'Чертёж')
    .replace(/Чертёж\s+Чертёж(?=[\s,.;:]|$)/gi, 'Чертёж');
  const text = value.split('\n').filter(line => !/^\s*Clarifications?\b|\bagent_basis\s*=/i.test(line))
    .map(line => line.replace(/\bпо\s+cq_[a-z0-9_-]+/g, 'по сохранённому ответу').replace(/\b(?:cq|ct)_[a-z0-9_-]+/g, ''))
    .map(line => line.split(/;|(?<=[.!?])\s+(?=[А-ЯA-Z])/).filter(clause => !auditRecord.test(clause.replace(/https?:\/\/\S+/g, ''))).map(clause => clause.trim()).filter(Boolean).join(' '))
    .filter(Boolean).join('\n').replace(/\bDETAIL\b/g, 'детализации').replace(/\bVERIFY\b/g, 'проверки чертежа').trim();
  if (!text) return null;
  return formatText(text);
}

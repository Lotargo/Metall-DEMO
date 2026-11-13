import type { components } from '@/api/schema';

type Question = components['schemas']['CompactClarificationQuestion'];
type Task = components['schemas']['CompactClarificationTask'];
export type ClarificationGroup = { id: string; question: string; sources: Question[]; task?: Task };

// Only literal equality merges questions. Related wording remains an operator choice.
export function groupClarifications(questions: Question[], tasks: Task[] = []): ClarificationGroup[] {
  const structured = tasks.map(task => ({ id: task.id, question: task.definition.title, sources: questions.filter(question => task.question_ids.includes(question.id)), task }));
  const assigned = new Set(structured.flatMap(group => group.sources.map(source => source.id)));
  const groups = new Map<string, ClarificationGroup>();
  for (const question of questions) {
    if (assigned.has(question.id)) continue;
    const existing = groups.get(question.question);
    if (existing) existing.sources.push(question);
    else groups.set(question.question, { id: question.id, question: question.question, sources: [question] });
  }
  return [...structured, ...groups.values()];
}

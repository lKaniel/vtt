import type { Doc } from '@vtt/core';
import { type Quest, QuestSchema } from '@vtt/shared';

// The quest log: journal entries with a quest, by status, and the GM's edits
// to their objectives.

export const QUEST_STATUS: readonly { status: Quest['status']; label: string }[] = [
  { status: 'active', label: 'Active' },
  { status: 'done', label: 'Done' },
  { status: 'failed', label: 'Failed' },
];

/** The entry's quest, if it is one. */
export function questOf(doc: Doc): Quest | undefined {
  if (doc.quest === undefined) return undefined;
  const parsed = QuestSchema.safeParse(doc.quest);
  return parsed.success ? parsed.data : undefined;
}

export interface QuestGroup {
  status: Quest['status'];
  label: string;
  quests: { doc: Doc; quest: Quest }[];
}

/** The quests among these entries, under each status that has any. */
export function questsBy(docs: readonly Doc[]): QuestGroup[] {
  const quests = docs.flatMap((doc) => {
    const quest = questOf(doc);
    return quest ? [{ doc, quest }] : [];
  });
  return QUEST_STATUS.map((s) => ({ ...s, quests: quests.filter((q) => q.quest.status === s.status) })).filter(
    (g) => g.quests.length,
  );
}

export function addObjective(quest: Quest, text: string): Quest {
  const trimmed = text.trim();
  return trimmed ? { ...quest, objectives: [...quest.objectives, { text: trimmed }] } : quest;
}

export function removeObjective(quest: Quest, i: number): Quest {
  return { ...quest, objectives: quest.objectives.filter((_, j) => j !== i) };
}

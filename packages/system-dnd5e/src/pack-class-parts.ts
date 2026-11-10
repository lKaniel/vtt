import type { PackCompendium } from '@vtt/core';
import { z } from 'zod';
import classAutomation from '../content/srd/class-automation.json' with { type: 'json' };
import { withClassAutomation } from './content.ts';
import { type Class, type Feature, FeatureSchema, type Subclass, SubclassSchema } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Packs that add to a class instead of bringing their own: a subclass for
// the SRD barbarian, a pact boon and its invocations for the warlock. Each
// document names its `class`; the automation written for it in
// class-automation.json is merged in: a subclass's under the class's
// `subclasses` as for its own, a feature's under `packFeatures` (kept apart
// so that it isn't added to the class when no pack brings it).

const ofClass = { class: z.string().min(1) };

/** A pack's subclass of an existing class. */
export const PackSubclassSchema = SubclassSchema.extend(ofClass);
/** A pack's feature (or choice option) of an existing class. */
export const PackClassFeatureSchema = FeatureSchema.extend(ofClass);

type Doc = Record<string, unknown> & { id: string; class: string };

const isDoc = (doc: unknown): doc is Doc => {
  const d = doc as Partial<Doc> | null;
  return typeof d?.id === 'string' && typeof d.class === 'string';
};

/**
 * A subclass with the automation its class keeps for it under `subclasses`:
 * only for the features the pack has (automation alone has no name or level).
 */
function automatedSubclass(doc: Doc, edition: Edition): unknown {
  const { class: cls, ...rest } = doc;
  const shell = withClassAutomation({ id: cls, subclasses: [rest] }, edition) as { subclasses: Doc[] };
  const sub = shell.subclasses[0]!;
  const features = sub.features as { name?: unknown }[] | undefined;
  return features ? { ...sub, features: features.filter((f) => typeof f.name === 'string') } : sub;
}

type Parts = Partial<Record<'both' | Edition, { packFeatures?: Record<string, object> }>>;

/** A class feature with the automation its class keeps for it under `packFeatures`, for both editions and then its own. */
function automatedFeature(doc: Doc, edition: Edition): unknown {
  const { class: cls, ...rest } = doc;
  const parts = (classAutomation as unknown as Record<string, Parts | undefined>)[cls];
  return { ...rest, ...parts?.both?.packFeatures?.[doc.id], ...parts?.[edition]?.packFeatures?.[doc.id] };
}

const docsOf = (compendia: readonly PackCompendium[], type: string): Doc[] =>
  compendia.filter((c) => c.type === type).flatMap((c) => c.docs.filter(isDoc));

/** `classes` with the subclasses and features of `compendia` joined to the classes they name. */
export function withClassParts(
  classes: ReadonlyMap<string, Class>,
  compendia: readonly PackCompendium[],
  edition: Edition,
): Map<string, Class> {
  const out = new Map(classes);
  for (const doc of docsOf(compendia, 'subclass')) {
    const cls = out.get(doc.class);
    const parsed = SubclassSchema.safeParse(automatedSubclass(doc, edition));
    if (cls && parsed.success) out.set(cls.id, { ...cls, subclasses: joined(cls.subclasses, parsed.data) });
  }
  for (const doc of docsOf(compendia, 'classFeature')) {
    const cls = out.get(doc.class);
    const parsed = FeatureSchema.safeParse(automatedFeature(doc, edition));
    if (cls && parsed.success) out.set(cls.id, { ...cls, features: joined(cls.features, parsed.data) });
  }
  return out;
}

/** `list` with `entry` in place of one of the same id, or at the end. */
function joined<T extends Subclass | Feature>(list: readonly T[] = [], entry: T): T[] {
  return [...list.filter((x) => x.id !== entry.id), entry];
}

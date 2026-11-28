import { useSyncExternalStore } from 'react';
import { PHONE_LAYOUTS, type PhoneLayout, usesPhoneLayout } from '../play/phone.ts';
import { readPref, writePref } from '../prefs.ts';

// Whether this browser lays the table out for a phone: the screen's size and
// the layout picked in settings, followed as either changes.

const PREF = 'phone-layout';
const CHANGED = 'vtt:phone-layout';

export function currentPhoneLayout(): PhoneLayout {
  return readPref(PREF, PHONE_LAYOUTS, 'auto');
}

export function setPhoneLayout(layout: PhoneLayout): void {
  writePref(PREF, layout);
  globalThis.dispatchEvent(new Event(CHANGED));
}

function phoneNow(): boolean {
  // Test pages (jsdom) have no matchMedia.
  const coarse = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;
  return usesPhoneLayout(currentPhoneLayout(), { width: innerWidth, height: innerHeight, coarse });
}

function subscribe(changed: () => void): () => void {
  globalThis.addEventListener('resize', changed);
  globalThis.addEventListener(CHANGED, changed);
  return () => {
    globalThis.removeEventListener('resize', changed);
    globalThis.removeEventListener(CHANGED, changed);
  };
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, phoneNow);
}

import { useState } from 'react';

// Copying text to the clipboard from a button, over https or plain http.

/** The old way to copy, for pages over plain http (a LAN address), where the clipboard API is missing. */
function copyByHand(text: string): Promise<void> {
  const box = document.createElement('textarea');
  box.value = text;
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.append(box);
  box.select();
  // eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated -- the only way to copy outside a secure context
  const ok = document.execCommand('copy');
  box.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy refused'));
}

/** Copies `text`, and says so for a moment; `false` when the browser won't. */
export function useCopy(): [boolean | undefined, (text: string) => void] {
  const [copied, setCopied] = useState<boolean>();
  const copy = (text: string) => {
    const done = window.isSecureContext ? navigator.clipboard.writeText(text) : copyByHand(text);
    done.then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(undefined), 2000);
      },
      () => setCopied(false),
    );
  };
  return [copied, copy];
}

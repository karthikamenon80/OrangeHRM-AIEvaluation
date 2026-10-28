import { Page } from '@playwright/test';

/**
 * Records any native browser dialog (alert/confirm/prompt) raised while it
 * is active, dismissing it so the test doesn't hang. Used to prove an action
 * applied without a confirmation prompt: OrangeHRM's own modal is checked
 * separately via `.oxd-dialog-sheet`, this catches the browser-level kind.
 */
export function recordNativeDialogs(page: Page): { messages: string[]; stop: () => void } {
  const messages: string[] = [];
  const handler = (dialog: import('@playwright/test').Dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  };
  page.on('dialog', handler);
  return { messages, stop: () => page.off('dialog', handler) };
}

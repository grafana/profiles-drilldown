// Jest setup provided by Grafana scaffolding
import { webcrypto } from 'node:crypto';

import './.config/jest-setup';

// jsdom's crypto lacks randomUUID; use Node's Web Crypto API in tests.
Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
}

// Emotion + :has() can produce selectors nwsapi cannot parse; Floating UI's Modal focus trap
// calls getComputedStyle and throws. Fall back so tab order / visibility checks still run.
const origGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudoElt) => {
  try {
    return origGetComputedStyle(element, pseudoElt);
  } catch {
    return {
      getPropertyValue: () => '',
      visibility: 'visible',
    };
  }
};

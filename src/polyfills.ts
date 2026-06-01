// Polyfills para Hermes — deve carregar antes de qualquer lib
if (typeof global.DOMException === 'undefined') {
  (global as any).DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}

if (typeof global.TextEncoder === 'undefined') {
  // @ts-ignore — text-encoding has no TypeScript declarations
  const { TextEncoder, TextDecoder } = require('text-encoding');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

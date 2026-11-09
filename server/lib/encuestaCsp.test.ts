import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCUESTA_CSP } from './encuestaCsp.ts';

const directiva = (nombre: string) => ENCUESTA_CSP.split(';').map(d => d.trim()).find(d => d.startsWith(nombre + ' ')) ?? '';

test('la encuesta puede enviar a Formspree y a ningún otro sitio', () => {
  assert.equal(directiva('connect-src'), 'connect-src https://formspree.io');
  assert.equal(directiva('form-action'), 'form-action https://formspree.io');
});

test('el resto queda cerrado: solo fuentes de Google, sin iframes ni objetos', () => {
  assert.equal(directiva('default-src'), "default-src 'self'");
  assert.equal(directiva('object-src'), "object-src 'none'");
  assert.equal(directiva('frame-ancestors'), "frame-ancestors 'none'");
  assert.match(directiva('font-src'), /^font-src https:\/\/fonts\.gstatic\.com$/);
});

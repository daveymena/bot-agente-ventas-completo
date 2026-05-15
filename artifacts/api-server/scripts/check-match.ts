import * as baileys from '@whiskeysockets/baileys';
console.log('default === makeWASocket:', (baileys as any).default === (baileys as any).makeWASocket);
console.log('default name:', (baileys as any).default?.name);
console.log('makeWASocket name:', (baileys as any).makeWASocket?.name);

import * as baileys from '@whiskeysockets/baileys';
const keys = Object.keys(baileys);
const found = keys.find(k => k.toLowerCase().includes('socket'));
console.log('Socket related keys:', keys.filter(k => k.toLowerCase().includes('socket')));
console.log('Default type:', typeof (baileys as any).default);

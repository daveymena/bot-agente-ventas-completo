import * as baileys from '@whiskeysockets/baileys';
console.log('Keys:', Object.keys(baileys));
if ((baileys as any).default) {
  console.log('Default keys:', Object.keys((baileys as any).default));
}

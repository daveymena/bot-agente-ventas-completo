import baileys from '@whiskeysockets/baileys';
console.log('Baileys imported successfully');
const { makeWASocket } = baileys as any;
console.log('makeWASocket type:', typeof makeWASocket);

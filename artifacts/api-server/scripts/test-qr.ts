import QRCode from 'qrcode';
async function test() {
  try {
    const url = await QRCode.toDataURL('test-qr');
    console.log('QR Success:', url.substring(0, 50));
  } catch (e) {
    console.error('QR Error:', e);
  }
}
test();

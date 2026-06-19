const QRCode = require('qrcode');
const path = require('path');

const url = 'exp://192.168.0.181:8082';
const outputPath = 'C:/Users/user/.gemini/antigravity/brain/dc29a8fb-babe-4f0c-9c5c-b3f5c8dc8cb7/expo_qr.png';

QRCode.toFile(outputPath, url, {
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  },
  width: 300
}, function (err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('QR Code generated successfully at ' + outputPath);
});

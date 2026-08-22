const fs = require('fs');
const path = require('path');

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

const publicSrc = path.join(__dirname, 'public');
const publicDest = path.join(__dirname, 'dist', 'public');
if (fs.existsSync(publicSrc)) {
  if (fs.existsSync(publicDest)) {
    fs.rmSync(publicDest, { recursive: true, force: true });
  }
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

const viewsSrc = path.join(__dirname, 'views');
const viewsDest = path.join(__dirname, 'dist', 'views');
if (fs.existsSync(viewsSrc)) {
  if (fs.existsSync(viewsDest)) {
    fs.rmSync(viewsDest, { recursive: true, force: true });
  }
  fs.cpSync(viewsSrc, viewsDest, { recursive: true });
}

fs.copyFileSync('server.js', path.join('dist', 'server.js'));
fs.copyFileSync('package.json', path.join('dist', 'package.json'));

console.log('✅ Build complete!');

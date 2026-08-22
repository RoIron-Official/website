const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
  res.render('index', {
    title: 'RoIron - Roblox Optimizer',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/features', (req, res) => {
  res.render('features', {
    title: 'Features - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/download', (req, res) => {
  res.render('download', {
    title: 'Download - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/docs', (req, res) => {
  res.render('docs', {
    title: 'Documentation - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/license', (req, res) => {
  res.render('license', {
    title: 'License - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.9' });
});

// For Vercel
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`✅ RoIron Website running on http://localhost:${PORT}`);
  });
}

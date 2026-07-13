const express = require('express');
const os = require('os');
const app = express();
const PORT = process.env.PORT || 3000;

// Simple middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Root endpoint: returns greetings and environment details
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Node.js REST API!',
    status: 'Running',
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint (for K8s liveness/readiness probes)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    checks: {
      uptime: process.uptime()
    }
  });
});

// API endpoint returning dummy list of items
app.get('/api/items', (req, res) => {
  res.json({
    items: [
      { id: 1, name: 'Item One', description: 'This is the first sample item.' },
      { id: 2, name: 'Item Two', description: 'This is the second sample item.' },
      { id: 3, name: 'Item Three', description: 'This is the third sample item.' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Hostname: ${os.hostname()}`);
});

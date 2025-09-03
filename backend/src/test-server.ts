import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Simple test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server working without routes' });
});

app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
});

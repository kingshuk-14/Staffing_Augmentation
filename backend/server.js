const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const resumesRoutes = require('./routes/resumes');
const jobsRoutes = require('./routes/jobs');
const vendorsRoutes = require('./routes/vendors');
const matchesRoutes = require('./routes/matches');
const candidatesRoutes = require('./routes/candidates');
const clientsRoutes = require('./routes/clients');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumesRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

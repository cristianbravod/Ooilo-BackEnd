// backend/src/app.js - Aplicación Principal MVC
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const reportRoutes = require('./routes/reports');
const tableRoutes = require('./routes/tables');

// Importar middleware
const { errorHandler, requestLogger } = require('./middleware/errorHandler');

const app = express();

// Configuración CORS para desarrollo
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:19000', // Expo Metro Bundler
    'http://localhost:19001', // Expo DevTools
    'http://localhost:19006', // Expo Web
    process.env.EXPO_URL || 'http://192.168.1.100:19000',
    `http://${process.env.LOCAL_IP || '192.168.1.100'}:19000`,
    `exp://${process.env.LOCAL_IP || '192.168.1.100'}:19000`,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware global
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging en desarrollo
if (process.env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

// Servir archivos estáticos (imágenes, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api', menuRoutes);  // /api/menu, /api/categorias, etc.
app.use('/api/ordenes', orderRoutes);
app.use('/api/reportes', reportRoutes);
app.use('/api/mesas', tableRoutes);

// Documentación básica de la API
app.get('/api', (req, res) => {
  res.json({
    message: 'Restaurant Management API',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      menu: '/api/menu',
      categories: '/api/categorias',
      orders: '/api/ordenes',
      reports: '/api/reportes',
      tables: '/api/mesas',
      health: '/api/health'
    },
    documentation: '/api/docs' // Para futuro Swagger
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: ['/api/health', '/api/menu', '/api/ordenes', '/api/auth']
  });
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;
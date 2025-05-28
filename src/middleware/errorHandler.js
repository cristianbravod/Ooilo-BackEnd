// src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Error de validación de express-validator
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired'
    });
  }

  // Error de PostgreSQL
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({
      message: 'Database constraint error',
      details: err.detail || err.message
    });
  }

  // Error de conexión a BD
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      message: 'Database connection failed'
    });
  }

  // Error por defecto
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path}`);
  next();
};

module.exports = {
  errorHandler,
  requestLogger
};
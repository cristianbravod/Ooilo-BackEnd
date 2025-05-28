// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

// Middleware de autenticación requerida
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Verificar que el usuario existe en la base de datos
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND activo = true', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        message: 'Access denied. User not found or inactive.',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Access denied. Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Access denied. Token expired.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Internal server error during authentication',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware de autenticación opcional (para rutas públicas que pueden usar auth)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND activo = true', [decoded.userId]);
    
    req.user = result.rows[0] || null;
    next();
  } catch (error) {
    // En caso de error, continuar sin usuario autenticado
    req.user = null;
    next();
  }
};

// Middleware para verificar rol de administrador
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Access denied. Authentication required.',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.rol !== 'admin') {
    return res.status(403).json({ 
      message: 'Access denied. Admin privileges required.',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

// Middleware para verificar múltiples roles
const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Access denied. Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    next();
  };
};

// Middleware para verificar propietario de recurso
const ownerMiddleware = (resourceField = 'usuario_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Access denied. Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    // Los admins pueden acceder a cualquier recurso
    if (req.user.rol === 'admin') {
      return next();
    }

    // Verificar si el usuario es propietario del recurso
    // Esto se debe complementar con lógica específica en cada controlador
    req.checkOwnership = (resource) => {
      return resource[resourceField] === req.user.id;
    };

    next();
  };
};

module.exports = {
  authMiddleware,
  optionalAuth,
  adminMiddleware,
  roleMiddleware,
  ownerMiddleware
};
// backend/src/config/database.js
require('dotenv').config();

const config = {
  // Configuración de PostgreSQL
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  
  // Configuraciones adicionales de la pool de conexiones
  max: 20, // Máximo número de conexiones en el pool
  idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexiones inactivas
  connectionTimeoutMillis: 2000, // Tiempo máximo para obtener conexión
  
  // SSL en producción
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Configuración específica por ambiente
const environments = {
  development: {
    ...config,
    max: 5, // Menos conexiones en desarrollo
  },
  
  test: {
    ...config,
    database: process.env.DB_NAME_TEST || 'restaurant_db_test',
    max: 2,
  },
  
  production: {
    ...config,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 60000,
  }
};

// Exportar configuración según el ambiente
const currentEnv = process.env.NODE_ENV || 'development';
module.exports = environments[currentEnv] || environments.development;
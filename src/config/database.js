// backend/src/config/database.js - Configuración corregida para SCRAM
require('dotenv').config();

// 🔧 CONFIGURACIÓN CORREGIDA PARA SUPABASE CON SCRAM
const baseConfig = {
  user: process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh',
  host: process.env.DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543,
  
  // 🔧 CONFIGURACIONES ESPECÍFICAS PARA RESOLVER SCRAM
  ssl: {
    rejectUnauthorized: false
  },
  
  // Configuraciones de pool optimizadas para Supabase
  max: 5, // Menos conexiones para evitar problemas SCRAM
  min: 0,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  acquireTimeoutMillis: 15000,
  
  // Configuraciones específicas para SCRAM authentication
  application_name: 'restaurant_app',
  keepAlive: false,
  keepAliveInitialDelayMillis: 0,
  
  // Timeouts para evitar problemas con SCRAM
  statement_timeout: 30000,
  query_timeout: 30000,
  
  // Soporte para URL completa si está disponible
  ...(process.env.DATABASE_URL && {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
};

// Configuración específica por ambiente
const environments = {
  development: {
    ...baseConfig,
    max: 3, // Aún menos conexiones en desarrollo
    idleTimeoutMillis: 5000,
    log: ['error', 'warn'], // Solo errores y warnings
  },
  
  test: {
    ...baseConfig,
    database: process.env.DB_NAME_TEST || 'postgres_test',
    max: 1, // Solo una conexión para tests
    idleTimeoutMillis: 1000,
  },
  
  production: {
    ...baseConfig,
    max: 10, // Más conexiones en producción
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  }
};

// 🔧 FUNCIÓN PARA CREAR POOL CON FALLBACK
function createPoolWithFallback() {
  const { Pool } = require('pg');
  const currentEnv = process.env.NODE_ENV || 'development';
  const config = environments[currentEnv] || environments.development;
  
  // Intentar con URL completa primero si está disponible
  if (process.env.DATABASE_URL) {
    console.log('🔗 Usando DATABASE_URL completa');
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: config.max,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis
    });
  }
  
  // Usar configuración individual
  console.log('🔧 Usando configuración individual');
  return new Pool(config);
}

// Validar configuración
function validateConfig() {
  if (!process.env.DB_PASSWORD) {
    console.error('❌ ERROR: DB_PASSWORD no está configurado');
    console.error('💡 Configura tu contraseña de Supabase en .env:');
    console.error('   DB_PASSWORD=tu_password_real');
    
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
  
  // Verificar formato del usuario
  const user = process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh';
  if (!user.includes('.')) {
    console.warn('⚠️ ADVERTENCIA: El usuario debería incluir el proyecto: postgres.{project-id}');
  }
  
  // Verificar puerto
  const port = process.env.DB_PORT || 6543;
  if (port != 6543 && port != 5432) {
    console.warn('⚠️ ADVERTENCIA: Puerto inusual para Supabase:', port);
  }
}

// Función para probar conexión
async function testConnection(pool) {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ Conexión a Supabase exitosa');
    return true;
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    
    if (error.message.includes('SCRAM')) {
      console.error('💡 Error SCRAM detectado. Posibles soluciones:');
      console.error('   1. Verificar contraseña en Supabase Dashboard');
      console.error('   2. Usar DATABASE_URL completa');
      console.error('   3. Reiniciar contraseña del proyecto');
    }
    
    return false;
  } finally {
    if (client) client.release();
  }
}

// Validar solo en entornos que no sean test
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

// Exportar configuración
const currentEnv = process.env.NODE_ENV || 'development';
const finalConfig = environments[currentEnv] || environments.development;

console.log('🔧 Configuración de base de datos:');
console.log(`   Entorno: ${currentEnv}`);
console.log(`   Host: ${finalConfig.host}`);
console.log(`   Puerto: ${finalConfig.port}`);
console.log(`   Database: ${finalConfig.database}`);
console.log(`   User: ${finalConfig.user}`);
console.log(`   SSL: ${finalConfig.ssl ? 'habilitado' : 'deshabilitado'}`);
console.log(`   Max conexiones: ${finalConfig.max}`);
console.log(`   URL completa: ${process.env.DATABASE_URL ? 'configurada' : 'no configurada'}`);

// Exportar tanto la configuración como las funciones útiles
module.exports = {
  ...finalConfig,
  createPoolWithFallback,
  testConnection,
  validateConfig
};
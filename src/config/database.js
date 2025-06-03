// backend/src/config/database.js - Configuración para Supabase
require('dotenv').config();

const config = {
  // Configuración de Supabase PostgreSQL
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db.ugcrigkvfejqlsoqnxxh.supabase.co',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD, // REQUERIDO para Supabase
  port: process.env.DB_PORT || 5432,
  
  // Configuraciones adicionales de la pool de conexiones
  max: 10, // Menos conexiones para Supabase (límites)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Más tiempo para conexiones remotas
  
  // SSL OBLIGATORIO para Supabase
  ssl: {
    rejectUnauthorized: false
  },
  
  // Configuraciones específicas para Supabase
  application_name: 'restaurant_app',
  statement_timeout: 30000,
  query_timeout: 30000,
  connectionString: process.env.DATABASE_URL, // Soporte para URL completa
};

// Configuración específica por ambiente
const environments = {
  development: {
    ...config,
    max: 5, // Menos conexiones en desarrollo
    ssl: {
      rejectUnauthorized: false
    }
  },
  
  test: {
    ...config,
    database: process.env.DB_NAME_TEST || 'postgres_test',
    max: 2,
    ssl: {
      rejectUnauthorized: false
    }
  },
  
  production: {
    ...config,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10, // Supabase tiene límites de conexión
    idleTimeoutMillis: 60000,
  }
};

// Validar configuración de Supabase
function validateSupabaseConfig() {
  const requiredVars = ['DB_PASSWORD'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Variables de entorno faltantes para Supabase:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n💡 Configura estas variables en tu archivo .env:');
    console.error('   DB_PASSWORD=Comoelvinot2012');
    console.error('   # O usa la URL completa:');
    console.error('   DATABASE_URL=postgresql://postgres:PASSWORD@db.ugcrigkvfejqlsoqnxxh.supabase.co:5432/postgres');
    process.exit(1);
  }
}

// Validar solo en entornos que no sean test
if (process.env.NODE_ENV !== 'test') {
  validateSupabaseConfig();
}

// Exportar configuración según el ambiente
const currentEnv = process.env.NODE_ENV || 'development';
const finalConfig = environments[currentEnv] || environments.development;

console.log('🔧 Configuración de base de datos:');
console.log(`   Entorno: ${currentEnv}`);
console.log(`   Host: ${finalConfig.host}`);
console.log(`   Database: ${finalConfig.database}`);
console.log(`   User: ${finalConfig.user}`);
console.log(`   SSL: ${finalConfig.ssl ? 'habilitado' : 'deshabilitado'}`);
console.log(`   Max conexiones: ${finalConfig.max}`);

module.exports = finalConfig;
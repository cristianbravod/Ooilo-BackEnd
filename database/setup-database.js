// scripts/setup-database.js - Configuración para Windows
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('🪟 Configurando base de datos en Windows...');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'Ooili',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Conectando a PostgreSQL...');
    
    // Leer el archivo SQL de inicialización
    const sqlPath = path.join(__dirname, '..', 'database', 'init.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error('❌ Archivo init.sql no encontrado en:', sqlPath);
      console.log('💡 Crea el archivo database/init.sql con el script de inicialización');
      process.exit(1);
    }
    
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Ejecutando script de inicialización...');
    await client.query(sqlScript);
    
    console.log('✅ Base de datos configurada exitosamente!');
    console.log('📊 Tablas creadas:');
    console.log('   - usuarios');
    console.log('   - categorias');
    console.log('   - menu_items');
    console.log('   - mesas');
    console.log('   - ordenes');
    console.log('   - orden_items');
    console.log('   - reservaciones');
    
    console.log('\n🔐 Usuario admin creado:');
    console.log('   Email: admin@restaurant.com');
    console.log('   Password: admin123');
    
    console.log('\n👤 Usuario cliente de prueba creado:');
    console.log('   Email: cliente@test.com');
    console.log('   Password: cliente123');
    
    // Verificar datos
    const result = await client.query('SELECT COUNT(*) FROM menu_items');
    console.log(`🍽️  ${result.rows[0].count} items del menú insertados`);
    
    const categoriesResult = await client.query('SELECT COUNT(*) FROM categorias');
    console.log(`📂 ${categoriesResult.rows[0].count} categorías creadas`);
    
  } catch (error) {
    console.error('❌ Error configurando la base de datos:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Soluciones posibles:');
      console.log('1. Verificar que PostgreSQL esté ejecutándose');
      console.log('2. Revisar credenciales en archivo .env');
      console.log('3. Verificar puerto (5432 por defecto)');
    }
    
    if (error.code === '3D000') {
      console.log('\n💡 La base de datos no existe. Creándola...');
      await createDatabaseIfNotExists();
      return setupDatabase(); // Reintentar
    }
    
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function createDatabaseIfNotExists() {
  const adminPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
  });

  try {
    const client = await adminPool.connect();
    const dbName = process.env.DB_NAME || 'restaurant_db';
    
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    
    if (result.rows.length === 0) {
      console.log(`🔨 Creando base de datos '${dbName}'...`);
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Base de datos '${dbName}' creada exitosamente`);
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Error creando la base de datos:', error.message);
    throw error;
  } finally {
    await adminPool.end();
  }
}

async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL exitosa');
    console.log('🕒 Timestamp:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    console.log('\n📋 Configuración actual:');
    console.log('   DB_HOST:', process.env.DB_HOST || 'localhost');
    console.log('   DB_PORT:', process.env.DB_PORT || '5432');
    console.log('   DB_NAME:', process.env.DB_NAME || 'restaurant_db');
    console.log('   DB_USER:', process.env.DB_USER || 'postgres');
    console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? '[configurado]' : '[NO CONFIGURADO]');
    return false;
  }
}

async function main() {
  console.log('🚀 Iniciando configuración de la base de datos...\n');
  
  try {
    await createDatabaseIfNotExists();
    
    const connected = await testConnection();
    if (!connected) {
      process.exit(1);
    }
    
    await setupDatabase();
    
    console.log('\n🎉 ¡Configuración completada exitosamente!');
    console.log('🔗 Ahora puedes iniciar el servidor con: npm run dev');
    console.log('🌐 O probar la conexión: npm start');
    
  } catch (error) {
    console.error('\n❌ Error en la configuración:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupDatabase, testConnection, createDatabaseIfNotExists };
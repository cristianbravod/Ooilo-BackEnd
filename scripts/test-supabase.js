// scripts/test-supabase.js - Script para probar la conexión a Supabase
const { Pool } = require('pg');
require('dotenv').config();

console.log('🧪 Probando conexión a Supabase PostgreSQL...\n');

// Configuración de Supabase (CORREGIDA)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh',
  host: process.env.DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543, // Puerto correcto del pooler
  ssl: {
    rejectUnauthorized: false
  },
  max: 2, // Solo para testing
  connectionTimeoutMillis: 10000
});

async function testBasicConnection() {
  console.log('🔌 Test 1: Conexión básica');
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as timestamp, version() as version');
    
    console.log('✅ Conexión exitosa');
    console.log(`   Timestamp: ${result.rows[0].timestamp}`);
    console.log(`   PostgreSQL: ${result.rows[0].version.split(' ')[1]}`);
    return true;
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function testDatabaseOperations() {
  console.log('\n📋 Test 2: Operaciones de base de datos');
  let client;
  try {
    client = await pool.connect();
    
    // Crear tabla temporal
    await client.query(`
      CREATE TEMP TABLE test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla temporal creada');
    
    // Insertar datos
    const insertResult = await client.query(
      'INSERT INTO test_table (name) VALUES ($1) RETURNING *',
      ['Test Record']
    );
    console.log('✅ Inserción exitosa');
    
    // Consultar datos
    const selectResult = await client.query('SELECT * FROM test_table');
    console.log(`✅ Consulta exitosa - ${selectResult.rows.length} registros`);
    
    // Actualizar datos
    await client.query(
      'UPDATE test_table SET name = $1 WHERE id = $2',
      ['Updated Record', insertResult.rows[0].id]
    );
    console.log('✅ Actualización exitosa');
    
    // Eliminar datos
    await client.query('DELETE FROM test_table WHERE id = $1', [insertResult.rows[0].id]);
    console.log('✅ Eliminación exitosa');
    
    return true;
  } catch (error) {
    console.error('❌ Error en operaciones:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function testTables() {
  console.log('\n🗂️ Test 3: Verificar tablas del sistema');
  let client;
  try {
    client = await pool.connect();
    
    const expectedTables = [
      'usuarios', 'categorias', 'menu_items', 'mesas', 
      'ordenes', 'orden_items', 'platos_especiales', 'reservaciones'
    ];
    
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1)
      ORDER BY table_name
    `, [expectedTables]);
    
    const foundTables = result.rows.map(row => row.table_name);
    const missingTables = expectedTables.filter(table => !foundTables.includes(table));
    
    console.log(`✅ Tablas encontradas (${foundTables.length}/${expectedTables.length}):`);
    foundTables.forEach(table => console.log(`   • ${table}`));
    
    if (missingTables.length > 0) {
      console.log('\n⚠️ Tablas faltantes:');
      missingTables.forEach(table => console.log(`   • ${table}`));
      console.log('\n💡 Ejecuta: npm run setup-supabase');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error verificando tablas:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function testDataIntegrity() {
  console.log('\n📊 Test 4: Integridad de datos');
  let client;
  try {
    client = await pool.connect();
    
    // Verificar datos básicos
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM usuarios) as usuarios,
        (SELECT COUNT(*) FROM categorias) as categorias,
        (SELECT COUNT(*) FROM menu_items) as menu_items,
        (SELECT COUNT(*) FROM mesas) as mesas
    `);
    
    const data = counts.rows[0];
    console.log('📈 Conteos de datos:');
    console.log(`   • Usuarios: ${data.usuarios}`);
    console.log(`   • Categorías: ${data.categorias}`);
    console.log(`   • Items del menú: ${data.menu_items}`);
    console.log(`   • Mesas: ${data.mesas}`);
    
    // Verificar usuario admin
    const adminCheck = await client.query(
      "SELECT email FROM usuarios WHERE rol = 'admin' LIMIT 1"
    );
    
    if (adminCheck.rows.length > 0) {
      console.log(`✅ Usuario admin encontrado: ${adminCheck.rows[0].email}`);
    } else {
      console.log('⚠️ No se encontró usuario admin');
    }
    
    // Verificar relaciones de clave foránea
    const relationCheck = await client.query(`
      SELECT 
        mi.nombre as menu_item,
        c.nombre as categoria
      FROM menu_items mi
      JOIN categorias c ON mi.categoria_id = c.id
      LIMIT 3
    `);
    
    if (relationCheck.rows.length > 0) {
      console.log('✅ Relaciones de claves foráneas funcionando');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error verificando integridad:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function testPerformance() {
  console.log('\n⚡ Test 5: Performance básico');
  let client;
  try {
    client = await pool.connect();
    
    const startTime = Date.now();
    
    // Query de ejemplo que simula uso real
    await client.query(`
      SELECT 
        mi.nombre,
        mi.precio,
        c.nombre as categoria
      FROM menu_items mi
      JOIN categorias c ON mi.categoria_id = c.id
      WHERE mi.disponible = true
      ORDER BY c.nombre, mi.nombre
    `);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Query ejecutado en ${duration}ms`);
    
    if (duration < 1000) {
      console.log('✅ Performance: Excelente');
    } else if (duration < 3000) {
      console.log('⚠️ Performance: Aceptable');
    } else {
      console.log('❌ Performance: Lento - revisa conexión');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error en test de performance:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function showConnectionInfo() {
  console.log('\n📋 Información de conexión:');
  console.log(`   Host: ${process.env.DB_HOST || 'db.ugcrigkvfejqlsoqnxxh.supabase.co'}`);
  console.log(`   Port: ${process.env.DB_PORT || '5432'}`);
  console.log(`   Database: ${process.env.DB_NAME || 'postgres'}`);
  console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
  console.log(`   SSL: habilitado`);
  console.log(`   Password: ${process.env.DB_PASSWORD ? '[configurado]' : '[❌ NO CONFIGURADO]'}`);
}

async function main() {
  console.log('🧪 SUITE DE PRUEBAS PARA SUPABASE POSTGRESQL');
  console.log('='.repeat(50));
  
  // Mostrar información de conexión
  showConnectionInfo();
  
  // Verificar variables de entorno
  if (!process.env.DB_PASSWORD) {
    console.error('\n❌ ERROR: DB_PASSWORD no está configurado');
    console.error('💡 Configura tu contraseña de Supabase en .env:');
    console.error('   DB_PASSWORD=tu_password_real');
    process.exit(1);
  }
  
  let allTestsPassed = true;
  
  try {
    // Test 1: Conexión básica
    const connectionTest = await testBasicConnection();
    if (!connectionTest) {
      allTestsPassed = false;
      console.log('\n❌ Test de conexión falló. Verifica tu configuración.');
      process.exit(1);
    }
    
    // Test 2: Operaciones de BD
    const operationsTest = await testDatabaseOperations();
    if (!operationsTest) {
      allTestsPassed = false;
    }
    
    // Test 3: Verificar tablas
    const tablesTest = await testTables();
    if (!tablesTest) {
      allTestsPassed = false;
    }
    
    // Test 4: Integridad de datos
    const integrityTest = await testDataIntegrity();
    if (!integrityTest) {
      allTestsPassed = false;
    }
    
    // Test 5: Performance
    const performanceTest = await testPerformance();
    if (!performanceTest) {
      allTestsPassed = false;
    }
    
    // Resumen final
    console.log('\n' + '='.repeat(50));
    if (allTestsPassed) {
      console.log('🎉 TODOS LOS TESTS PASARON');
      console.log('✅ Tu conexión a Supabase está funcionando perfectamente');
      console.log('\n🚀 Próximos pasos:');
      console.log('   1. Ejecuta: npm start');
      console.log('   2. Prueba la API: http://localhost:3000/api/health');
      console.log('   3. Conecta tu aplicación móvil');
    } else {
      console.log('⚠️ ALGUNOS TESTS FALLARON');
      console.log('💡 Revisa los errores anteriores y ejecuta:');
      console.log('   npm run setup-supabase');
    }
    
  } catch (error) {
    console.error('\n❌ Error ejecutando tests:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexiones cerradas');
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  testBasicConnection, 
  testDatabaseOperations, 
  testTables, 
  testDataIntegrity, 
  testPerformance 
};
// scripts/check-database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function checkDatabaseStructure() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Revisando estructura actual de la base de datos...\n');

    // 1. Listar todas las tablas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('📋 Tablas existentes:');
    tables.rows.forEach(table => {
      console.log(`  • ${table.table_name}`);
    });

    // 2. Revisar estructura de cada tabla importante
    const importantTables = ['usuarios', 'categorias', 'menu_items', 'ordenes', 'orden_items', 'mesas'];
    
    for (const tableName of importantTables) {
      const tableExists = tables.rows.some(t => t.table_name === tableName);
      
      if (tableExists) {
        console.log(`\n📊 Estructura de tabla "${tableName}":`);
        
        const columns = await client.query(`
          SELECT 
            column_name, 
            data_type, 
            is_nullable, 
            column_default,
            character_maximum_length
          FROM information_schema.columns 
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);
        
        columns.rows.forEach(col => {
          const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
          const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`  • ${col.column_name}: ${col.data_type}${length} ${nullable}${defaultVal}`);
        });

        // Contar registros
        const count = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
        console.log(`  📊 Registros: ${count.rows[0].count}`);
        
      } else {
        console.log(`\n❌ Tabla "${tableName}" NO EXISTE`);
      }
    }

    // 3. Revisar datos de ejemplo
    console.log('\n📊 Datos de ejemplo:');
    
    try {
      const sampleMenu = await client.query('SELECT * FROM menu_items LIMIT 3');
      console.log(`\n🍽️  Ejemplo de menu_items (${sampleMenu.rows.length} registros):`);
      sampleMenu.rows.forEach((item, i) => {
        console.log(`  ${i+1}. ${item.nombre || 'Sin nombre'} - $${item.precio || 0}`);
      });
    } catch (e) {
      console.log('❌ Error leyendo menu_items:', e.message);
    }

    try {
      const sampleOrders = await client.query('SELECT * FROM ordenes LIMIT 3');
      console.log(`\n📋 Ejemplo de ordenes (${sampleOrders.rows.length} registros):`);
      sampleOrders.rows.forEach((order, i) => {
        const mesa = order.mesa || order.table || 'Sin mesa';
        console.log(`  ${i+1}. ID: ${order.id}, Mesa: ${mesa}, Total: $${order.total || 0}, Estado: ${order.estado || 'sin estado'}`);
      });
    } catch (e) {
      console.log('❌ Error leyendo ordenes:', e.message);
    }

    // 4. Verificar compatibilidad MVC
    console.log('\n🔧 Verificando compatibilidad para MVC:');
    
    const compatibility = {
      ordenes_mesa: false,
      ordenes_tipo_orden: false,
      menu_items_especial: false,
      usuarios_rol: false
    };

    try {
      await client.query('SELECT mesa FROM ordenes LIMIT 1');
      compatibility.ordenes_mesa = true;
    } catch (e) {
      console.log('❌ Falta columna "mesa" en ordenes');
    }

    try {
      await client.query('SELECT tipo_orden FROM ordenes LIMIT 1');
      compatibility.ordenes_tipo_orden = true;
    } catch (e) {
      console.log('⚠️  Falta columna "tipo_orden" en ordenes (opcional)');
    }

    try {
      await client.query('SELECT es_especial FROM menu_items LIMIT 1');
      compatibility.menu_items_especial = true;
    } catch (e) {
      console.log('⚠️  Falta columna "es_especial" en menu_items (opcional)');
    }

    try {
      await client.query('SELECT rol FROM usuarios LIMIT 1');
      compatibility.usuarios_rol = true;
    } catch (e) {
      console.log('❌ Falta columna "rol" en usuarios');
    }

    const compatibilityScore = Object.values(compatibility).filter(Boolean).length;
    console.log(`\n📊 Compatibilidad MVC: ${compatibilityScore}/4`);

    if (compatibilityScore === 4) {
      console.log('✅ Base de datos completamente compatible con MVC');
    } else {
      console.log('⚠️  Necesitas ejecutar el script de migración');
      console.log('   Comando: node scripts/migrate-database.js');
    }

  } catch (error) {
    console.error('❌ Error revisando base de datos:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  checkDatabaseStructure();
}

module.exports = { checkDatabaseStructure };
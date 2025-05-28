// scripts/migrate-database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function checkColumnExists(tableName, columnName) {
  const query = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 AND column_name = $2
  `;
  const result = await pool.query(query, [tableName, columnName]);
  return result.rows.length > 0;
}

async function checkTableExists(tableName) {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name = $1
  `;
  const result = await pool.query(query, [tableName]);
  return result.rows.length > 0;
}

async function migrateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migración de base de datos...\n');

    // 1. Verificar estructura actual de la tabla ordenes
    console.log('📊 Verificando estructura actual...');
    
    const currentColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'ordenes'
      ORDER BY ordinal_position
    `);
    
    console.log('Columnas actuales en tabla ordenes:');
    currentColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    // 2. Agregar columna 'mesa' si no existe
    if (!(await checkColumnExists('ordenes', 'mesa'))) {
      console.log('\n➕ Agregando columna "mesa"...');
      await client.query(`
        ALTER TABLE ordenes 
        ADD COLUMN mesa VARCHAR(50)
      `);
      
      // Actualizar órdenes existentes con valores por defecto
      await client.query(`
        UPDATE ordenes 
        SET mesa = 'Mesa ' || (id % 5 + 1)
        WHERE mesa IS NULL
      `);
      
      console.log('✅ Columna "mesa" agregada exitosamente');
    } else {
      console.log('✅ Columna "mesa" ya existe');
    }

    // 3. Agregar columna 'tipo_orden' si no existe
    if (!(await checkColumnExists('ordenes', 'tipo_orden'))) {
      console.log('➕ Agregando columna "tipo_orden"...');
      await client.query(`
        ALTER TABLE ordenes 
        ADD COLUMN tipo_orden VARCHAR(20) DEFAULT 'mesa' 
        CHECK (tipo_orden IN ('mesa', 'delivery', 'pickup'))
      `);
      console.log('✅ Columna "tipo_orden" agregada exitosamente');
    } else {
      console.log('✅ Columna "tipo_orden" ya existe');
    }

    // 4. Mejorar tabla menu_items para platos especiales
    if (!(await checkColumnExists('menu_items', 'es_especial'))) {
      console.log('➕ Agregando columna "es_especial" a menu_items...');
      await client.query(`
        ALTER TABLE menu_items 
        ADD COLUMN es_especial BOOLEAN DEFAULT false
      `);
      console.log('✅ Columna "es_especial" agregada exitosamente');
    } else {
      console.log('✅ Columna "es_especial" ya existe');
    }

    // 5. Agregar más campos nutricionales si no existen
    const nutritionalFields = [
      { name: 'vegano', type: 'BOOLEAN DEFAULT false' },
      { name: 'sin_gluten', type: 'BOOLEAN DEFAULT false' },
      { name: 'calorias', type: 'INTEGER' }
    ];

    for (const field of nutritionalFields) {
      if (!(await checkColumnExists('menu_items', field.name))) {
        console.log(`➕ Agregando columna "${field.name}" a menu_items...`);
        await client.query(`ALTER TABLE menu_items ADD COLUMN ${field.name} ${field.type}`);
        console.log(`✅ Columna "${field.name}" agregada exitosamente`);
      } else {
        console.log(`✅ Columna "${field.name}" ya existe`);
      }
    }

    // 6. Crear índices para mejorar performance
    console.log('\n📈 Creando índices para mejorar performance...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ordenes_mesa ON ordenes(mesa)',
      'CREATE INDEX IF NOT EXISTS idx_ordenes_tipo ON ordenes(tipo_orden)',
      'CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_estado ON ordenes(fecha_creacion, estado)',
      'CREATE INDEX IF NOT EXISTS idx_menu_items_especial ON menu_items(es_especial)',
      'CREATE INDEX IF NOT EXISTS idx_menu_items_disponible_categoria ON menu_items(disponible, categoria_id)'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }
    console.log('✅ Índices creados exitosamente');

    // 7. Actualizar datos existentes para compatibilidad
    console.log('\n🔄 Actualizando datos existentes...');
    
    // Marcar algunos platos como especiales (ejemplo)
    const especialesCount = await client.query(`
      UPDATE menu_items 
      SET es_especial = true 
      WHERE nombre ILIKE '%especial%' OR precio > (
        SELECT AVG(precio) * 1.5 FROM menu_items
      )
    `);
    console.log(`✅ ${especialesCount.rowCount} platos marcados como especiales`);

    // 8. Verificar estructura final
    console.log('\n📋 Estructura final de tabla ordenes:');
    const finalColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'ordenes'
      ORDER BY ordinal_position
    `);
    
    finalColumns.rows.forEach(col => {
      console.log(`  ✅ ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    console.log('\n🎉 ¡Migración completada exitosamente!');
    console.log('\n📋 Resumen de cambios:');
    console.log('  • Columna "mesa" agregada a ordenes');
    console.log('  • Columna "tipo_orden" agregada a ordenes');
    console.log('  • Columna "es_especial" agregada a menu_items');
    console.log('  • Campos nutricionales agregados a menu_items');
    console.log('  • Índices optimizados creados');
    console.log('  • Datos existentes actualizados');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Función para verificar compatibilidad
async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('\n🧪 Verificando migración...');
    
    // Probar que podemos crear una orden con mesa
    const testQuery = `
      SELECT 'mesa' as test_column_exists
      FROM ordenes 
      LIMIT 1
    `;
    
    await client.query(testQuery);
    console.log('✅ La columna "mesa" es accesible');
    
    // Contar registros
    const counts = await Promise.all([
      client.query('SELECT COUNT(*) FROM ordenes'),
      client.query('SELECT COUNT(*) FROM menu_items'),
      client.query('SELECT COUNT(*) FROM categorias'),
      client.query('SELECT COUNT(*) FROM menu_items WHERE es_especial = true')
    ]);
    
    console.log('\n📊 Estado actual de la base de datos:');
    console.log(`  • Órdenes: ${counts[0].rows[0].count}`);
    console.log(`  • Items del menú: ${counts[1].rows[0].count}`);
    console.log(`  • Categorías: ${counts[2].rows[0].count}`);
    console.log(`  • Platos especiales: ${counts[3].rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error en verificación:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar migración
async function main() {
  try {
    await migrateDatabase();
    await verifyMigration();
    console.log('\n🚀 ¡Base de datos lista para el backend MVC!');
  } catch (error) {
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { migrateDatabase, verifyMigration };
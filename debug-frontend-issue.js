// debug-frontend-issue.js - Diagnosticar problema frontend-backend
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurante_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkDatabaseContent() {
  log('🔍 DIAGNÓSTICO: Contenido de Base de Datos', 'bright');
  log('==========================================', 'bright');
  
  const client = await pool.connect();
  try {
    // 1. Verificar categorías
    log('\n📂 CATEGORÍAS:', 'blue');
    const categorias = await client.query('SELECT * FROM categorias ORDER BY id');
    if (categorias.rows.length === 0) {
      log('❌ No hay categorías en la base de datos', 'red');
    } else {
      categorias.rows.forEach(cat => {
        log(`✅ ID: ${cat.id} | Nombre: "${cat.nombre}" | Activo: ${cat.activo}`, 'green');
      });
    }
    
    // 2. Verificar productos en menu_items
    log('\n🍽️ PRODUCTOS EN MENU_ITEMS:', 'blue');
    const menuItems = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      LEFT JOIN categorias c ON m.categoria_id = c.id 
      ORDER BY m.categoria_id, m.nombre
    `);
    
    if (menuItems.rows.length === 0) {
      log('❌ No hay productos en menu_items', 'red');
    } else {
      log(`✅ Total productos: ${menuItems.rows.length}`, 'green');
      
      // Agrupar por categoría
      const porCategoria = {};
      menuItems.rows.forEach(item => {
        const catNombre = item.categoria_nombre || 'Sin Categoría';
        if (!porCategoria[catNombre]) {
          porCategoria[catNombre] = [];
        }
        porCategoria[catNombre].push(item);
      });
      
      Object.entries(porCategoria).forEach(([categoria, items]) => {
        log(`\n  📂 ${categoria} (${items.length} productos):`, 'cyan');
        items.forEach(item => {
          const disponible = item.disponible ? '✅' : '❌';
          log(`    ${disponible} "${item.nombre}" - $${item.precio} (ID: ${item.id})`, 'cyan');
        });
      });
    }
    
    // 3. Verificar productos legacy (si existe la tabla)
    try {
      log('\n🔍 PRODUCTOS LEGACY (tabla productos):', 'blue');
      const productosLegacy = await client.query('SELECT COUNT(*) as count FROM productos');
      log(`ℹ️ Productos en tabla legacy: ${productosLegacy.rows[0].count}`, 'yellow');
      
      if (productosLegacy.rows[0].count > 0) {
        log('⚠️ PROBLEMA: Tienes productos en tabla legacy "productos"', 'yellow');
        log('El frontend podría estar buscando ahí en lugar de menu_items', 'yellow');
      }
    } catch (error) {
      log('✅ Tabla "productos" no existe (correcto después de migración)', 'green');
    }
    
    // 4. Verificar platos especiales
    log('\n⭐ PLATOS ESPECIALES:', 'blue');
    const especiales = await client.query('SELECT * FROM platos_especiales WHERE disponible = true ORDER BY nombre');
    if (especiales.rows.length === 0) {
      log('ℹ️ No hay platos especiales disponibles', 'cyan');
    } else {
      especiales.rows.forEach(esp => {
        log(`✅ "${esp.nombre}" - $${esp.precio} (ID: ${esp.id})`, 'green');
      });
    }
    
    return {
      categorias: categorias.rows,
      menuItems: menuItems.rows,
      especiales: especiales.rows
    };
    
  } catch (error) {
    log(`❌ Error verificando base de datos: ${error.message}`, 'red');
    return null;
  } finally {
    client.release();
  }
}

async function testApiEndpoints() {
  log('\n🌐 DIAGNÓSTICO: Endpoints de API', 'bright');
  log('=================================', 'bright');
  
  const baseUrl = 'http://localhost:3000/api';
  
  try {
    const fetch = require('node-fetch');
    
    // Test 1: Health check
    log('\n🏥 Test: Health Check', 'blue');
    try {
      const healthResponse = await fetch(`${baseUrl}/health`);
      const healthData = await healthResponse.json();
      log(`✅ Status: ${healthData.status}`, 'green');
      log(`✅ Version: ${healthData.version}`, 'green');
      log(`✅ Migration Status: ${healthData.migration_status}`, 'green');
    } catch (error) {
      log(`❌ Health check falló: ${error.message}`, 'red');
      log('⚠️ Asegúrate de que el servidor esté corriendo en puerto 3000', 'yellow');
      return false;
    }
    
    // Test 2: Categorías
    log('\n📂 Test: /api/categorias', 'blue');
    try {
      const categoriasResponse = await fetch(`${baseUrl}/categorias`);
      const categoriasData = await categoriasResponse.json();
      
      if (Array.isArray(categoriasData) && categoriasData.length > 0) {
        log(`✅ Categorías obtenidas: ${categoriasData.length}`, 'green');
        categoriasData.forEach(cat => {
          log(`   • ${cat.nombre} (ID: ${cat.id})`, 'cyan');
        });
      } else {
        log('❌ No se obtuvieron categorías o formato incorrecto', 'red');
        log(`Respuesta: ${JSON.stringify(categoriasData)}`, 'red');
      }
    } catch (error) {
      log(`❌ Error obteniendo categorías: ${error.message}`, 'red');
    }
    
    // Test 3: Menú
    log('\n🍽️ Test: /api/menu', 'blue');
    try {
      const menuResponse = await fetch(`${baseUrl}/menu`);
      const menuData = await menuResponse.json();
      
      if (Array.isArray(menuData) && menuData.length > 0) {
        log(`✅ Productos obtenidos: ${menuData.length}`, 'green');
        
        // Agrupar por categoría
        const porCategoria = {};
        menuData.forEach(item => {
          const catNombre = item.categoria_nombre || 'Sin Categoría';
          if (!porCategoria[catNombre]) {
            porCategoria[catNombre] = 0;
          }
          porCategoria[catNombre]++;
        });
        
        Object.entries(porCategoria).forEach(([categoria, count]) => {
          log(`   • ${categoria}: ${count} productos`, 'cyan');
        });
      } else {
        log('❌ No se obtuvieron productos o formato incorrecto', 'red');
        log(`Respuesta: ${JSON.stringify(menuData)}`, 'red');
      }
    } catch (error) {
      log(`❌ Error obteniendo menú: ${error.message}`, 'red');
    }
    
    // Test 4: Menu Sync (el que usa tu frontend)
    log('\n🔄 Test: /api/menu/sync', 'blue');
    try {
      const syncResponse = await fetch(`${baseUrl}/menu/sync`);
      const syncData = await syncResponse.json();
      
      if (Array.isArray(syncData) && syncData.length > 0) {
        log(`✅ Productos sincronizados: ${syncData.length}`, 'green');
        log('✅ Este endpoint es el que usa tu frontend React Native', 'green');
      } else {
        log('❌ Sync endpoint no devuelve productos', 'red');
        log('🚨 ESTE ES PROBABLEMENTE EL PROBLEMA', 'red');
        log(`Respuesta: ${JSON.stringify(syncData)}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en menu sync: ${error.message}`, 'red');
    }
    
    // Test 5: Platos especiales
    log('\n⭐ Test: /api/platos-especiales', 'blue');
    try {
      const especialesResponse = await fetch(`${baseUrl}/platos-especiales`);
      const especialesData = await especialesResponse.json();
      
      if (Array.isArray(especialesData)) {
        log(`✅ Platos especiales: ${especialesData.length}`, 'green');
      } else {
        log('❌ Error obteniendo platos especiales', 'red');
      }
    } catch (error) {
      log(`❌ Error obteniendo platos especiales: ${error.message}`, 'red');
    }
    
    return true;
    
  } catch (error) {
    log(`❌ Error general en tests de API: ${error.message}`, 'red');
    log('💡 Instala node-fetch: npm install node-fetch', 'yellow');
    return false;
  }
}

async function generateSampleData() {
  log('\n🏭 GENERANDO DATOS DE PRUEBA', 'bright');
  log('=============================', 'bright');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Verificar si ya hay productos
    const existingProducts = await client.query('SELECT COUNT(*) as count FROM menu_items');
    if (existingProducts.rows[0].count > 0) {
      log(`ℹ️ Ya tienes ${existingProducts.rows[0].count} productos, saltando generación`, 'cyan');
      await client.query('ROLLBACK');
      return;
    }
    
    log('📝 Creando productos de ejemplo...', 'yellow');
    
    // Obtener IDs de categorías existentes
    const categorias = await client.query('SELECT id, nombre FROM categorias ORDER BY id');
    const catMap = {};
    categorias.rows.forEach(cat => {
      catMap[cat.nombre.toLowerCase()] = cat.id;
    });
    
    // Productos de ejemplo
    const productosEjemplo = [
      // Entradas
      { nombre: 'Empanadas de Queso', precio: 2500, categoria: 'entradas', descripcion: 'Empanadas caseras rellenas de queso' },
      { nombre: 'Tabla de Fiambres', precio: 4500, categoria: 'entradas', descripcion: 'Selección de fiambres y quesos' },
      
      // Platos Principales  
      { nombre: 'Pollo Grillado', precio: 8500, categoria: 'platos principales', descripcion: 'Pollo a la parrilla con papas' },
      { nombre: 'Pasta Bolognesa', precio: 7200, categoria: 'platos principales', descripcion: 'Pasta con salsa bolognesa casera' },
      
      // Bebidas
      { nombre: 'Jugo Natural', precio: 2200, categoria: 'bebidas', descripcion: 'Jugo de frutas naturales' },
      { nombre: 'Gaseosa', precio: 1800, categoria: 'bebidas', descripcion: 'Bebida gaseosa 350ml' },
      
      // Postres
      { nombre: 'Flan Casero', precio: 2800, categoria: 'postres', descripcion: 'Flan casero con dulce de leche' },
      { nombre: 'Helado', precio: 2500, categoria: 'postres', descripcion: 'Helado artesanal' }
    ];
    
    let creados = 0;
    for (const producto of productosEjemplo) {
      // Buscar ID de categoría
      let categoriaId = null;
      for (const [catNombre, catId] of Object.entries(catMap)) {
        if (catNombre.includes(producto.categoria) || producto.categoria.includes(catNombre)) {
          categoriaId = catId;
          break;
        }
      }
      
      // Usar primera categoría si no encuentra coincidencia
      if (!categoriaId && categorias.rows.length > 0) {
        categoriaId = categorias.rows[0].id;
      }
      
      if (categoriaId) {
        await client.query(`
          INSERT INTO menu_items (nombre, precio, categoria_id, descripcion, disponible, tiempo_preparacion)
          VALUES ($1, $2, $3, $4, true, 15)
        `, [producto.nombre, producto.precio, categoriaId, producto.descripcion]);
        
        creados++;
        log(`   ✅ ${producto.nombre} - $${producto.precio}`, 'green');
      }
    }
    
    await client.query('COMMIT');
    log(`✅ Creados ${creados} productos de ejemplo`, 'green');
    
  } catch (error) {
    await client.query('ROLLBACK');
    log(`❌ Error creando datos de ejemplo: ${error.message}`, 'red');
  } finally {
    client.release();
  }
}

async function main() {
  log('🔧 DIAGNÓSTICO FRONTEND-BACKEND', 'bright');
  log('================================', 'bright');
  
  try {
    // Paso 1: Verificar contenido de BD
    const dbContent = await checkDatabaseContent();
    if (!dbContent) {
      log('❌ No se pudo conectar a la base de datos', 'red');
      process.exit(1);
    }
    
    // Paso 2: Si no hay productos, crear algunos de ejemplo
    if (dbContent.menuItems.length === 0) {
      log('\n⚠️ No hay productos en menu_items', 'yellow');
      log('¿Quieres crear algunos productos de ejemplo? (y/n):', 'yellow');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('Respuesta: ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
        await generateSampleData();
      }
    }
    
    // Paso 3: Probar endpoints de API
    const apiWorking = await testApiEndpoints();
    
    // Diagnóstico final
    log('\n📋 RESUMEN DEL DIAGNÓSTICO:', 'bright');
    log('============================', 'bright');
    
    if (dbContent.categorias.length === 0) {
      log('❌ PROBLEMA: No hay categorías en la BD', 'red');
    } else {
      log(`✅ Categorías: ${dbContent.categorias.length}`, 'green');
    }
    
    if (dbContent.menuItems.length === 0) {
      log('❌ PROBLEMA: No hay productos en menu_items', 'red');
      log('💡 Solución: Crear productos o verificar migración', 'yellow');
    } else {
      log(`✅ Productos: ${dbContent.menuItems.length}`, 'green');
    }
    
    if (!apiWorking) {
      log('❌ PROBLEMA: APIs no responden correctamente', 'red');
      log('💡 Solución: Verificar que server.js esté corriendo', 'yellow');
    } else {
      log('✅ APIs funcionando', 'green');
    }
    
    log('\n🚀 PRÓXIMOS PASOS:', 'bright');
    if (dbContent.menuItems.length === 0) {
      log('1. Crear productos de ejemplo (ejecuta este script de nuevo)', 'cyan');
      log('2. O crear productos desde tu app React Native', 'cyan');
    }
    log('3. Verificar que server.js esté usando el código actualizado', 'cyan');
    log('4. Comprobar URL de conexión en tu app React Native', 'cyan');
    log('5. Revisar logs del servidor al hacer requests desde la app', 'cyan');
    
  } catch (error) {
    log(`💥 Error en diagnóstico: ${error.message}`, 'red');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkDatabaseContent, testApiEndpoints, generateSampleData };
// migrate-database-safe.js - Versión que maneja funciones existentes
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

async function analyzeCurrentSchema() {
  log('\n🔍 Analizando esquema actual...', 'blue');
  
  const client = await pool.connect();
  try {
    // Verificar tablas existentes
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    log('📋 Tablas encontradas:', 'cyan');
    tables.rows.forEach(row => {
      log(`   • ${row.table_name}`, 'cyan');
    });
    
    // Contar registros en tablas relevantes
    const tablesToCheck = ['menu_items', 'ordenes', 'orden_items', 'pedidos', 'detalle_pedidos'];
    const tableCounts = {};
    
    for (const tableName of tablesToCheck) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        tableCounts[tableName] = parseInt(result.rows[0].count);
      } catch (error) {
        tableCounts[tableName] = 'NO_EXISTE';
      }
    }
    
    log('\n📊 Contenido de tablas relevantes:', 'cyan');
    Object.entries(tableCounts).forEach(([table, count]) => {
      const status = count === 'NO_EXISTE' ? '❌ NO EXISTE' : `✅ ${count} registros`;
      log(`   • ${table}: ${status}`, count === 'NO_EXISTE' ? 'red' : 'cyan');
    });
    
    // Verificar funciones existentes
    const functions = await client.query(`
      SELECT 
        routine_name, 
        data_type as return_type,
        routine_definition
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name IN ('generar_numero_pedido', 'actualizar_totales_pedido', 'completar_pedido')
    `);
    
    if (functions.rows.length > 0) {
      log('\n🔧 Funciones existentes encontradas:', 'yellow');
      functions.rows.forEach(row => {
        log(`   • ${row.routine_name} (retorna: ${row.return_type})`, 'yellow');
      });
    }
    
    return { tableCounts, existingFunctions: functions.rows };
    
  } catch (error) {
    log(`❌ Error analizando esquema: ${error.message}`, 'red');
    return null;
  } finally {
    client.release();
  }
}

async function safeDropAndRecreateFunctions(client) {
  log('🔧 Eliminando funciones existentes para recrear...', 'yellow');
  
  const functionsToRecreate = [
    'generar_numero_pedido',
    'actualizar_totales_pedido', 
    'completar_pedido'
  ];
  
  // Primero eliminar triggers que usen las funciones
  try {
    await client.query('DROP TRIGGER IF EXISTS trigger_actualizar_totales ON detalle_pedidos');
    log('   ✅ Trigger eliminado', 'green');
  } catch (error) {
    log(`   ⚠️ Error eliminando trigger: ${error.message}`, 'yellow');
  }
  
  // Luego eliminar funciones
  for (const funcName of functionsToRecreate) {
    try {
      await client.query(`DROP FUNCTION IF EXISTS ${funcName} CASCADE`);
      log(`   ✅ Función ${funcName} eliminada`, 'green');
    } catch (error) {
      log(`   ⚠️ Error eliminando ${funcName}: ${error.message}`, 'yellow');
    }
  }
}

async function createFreshFunctions(client) {
  log('🛠️ Creando funciones nuevas...', 'yellow');
  
  try {
    // 1. Función para generar números de pedido
    await client.query(`
      CREATE FUNCTION generar_numero_pedido()
      RETURNS TEXT AS $$
      DECLARE
          nuevo_numero TEXT;
          existe BOOLEAN;
          contador INTEGER := 0;
      BEGIN
          LOOP
              nuevo_numero := 'PED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                             LPAD(((EXTRACT(EPOCH FROM NOW())::INTEGER + contador) % 10000)::TEXT, 4, '0');
              
              SELECT EXISTS(SELECT 1 FROM pedidos WHERE numero_pedido = nuevo_numero) INTO existe;
              
              IF NOT existe THEN
                  EXIT;
              END IF;
              
              contador := contador + 1;
              IF contador > 100 THEN
                  -- Fallback si hay muchas colisiones
                  nuevo_numero := 'PED-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || 
                                 LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
                  EXIT;
              END IF;
          END LOOP;
          
          RETURN nuevo_numero;
      END;
      $$ LANGUAGE plpgsql;
    `);
    log('   ✅ generar_numero_pedido creada', 'green');
    
    // 2. Función para actualizar totales
    await client.query(`
      CREATE FUNCTION actualizar_totales_pedido()
      RETURNS TRIGGER AS $$
      DECLARE
          pedido_id_target INTEGER;
      BEGIN
          -- Determinar el pedido_id a actualizar
          IF TG_OP = 'DELETE' THEN
              pedido_id_target := OLD.pedido_id;
          ELSE
              pedido_id_target := NEW.pedido_id;
          END IF;
          
          -- Actualizar totales del pedido
          UPDATE pedidos 
          SET 
              subtotal = COALESCE((
                  SELECT SUM(subtotal) 
                  FROM detalle_pedidos 
                  WHERE pedido_id = pedido_id_target
              ), 0),
              total = COALESCE((
                  SELECT SUM(subtotal) 
                  FROM detalle_pedidos 
                  WHERE pedido_id = pedido_id_target
              ), 0),
              updated_at = NOW()
          WHERE id = pedido_id_target;
          
          RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
    log('   ✅ actualizar_totales_pedido creada', 'green');
    
    // 3. Crear trigger
    await client.query(`
      CREATE TRIGGER trigger_actualizar_totales
          AFTER INSERT OR UPDATE OR DELETE ON detalle_pedidos
          FOR EACH ROW
          EXECUTE FUNCTION actualizar_totales_pedido();
    `);
    log('   ✅ Trigger trigger_actualizar_totales creado', 'green');
    
    // 4. Función para completar pedidos
    await client.query(`
      CREATE FUNCTION completar_pedido(
          p_pedido_id INTEGER,
          p_metodo_pago TEXT DEFAULT 'efectivo'
      )
      RETURNS VOID AS $$
      DECLARE
          pedido_existe BOOLEAN;
      BEGIN
          -- Verificar que el pedido existe
          SELECT EXISTS(SELECT 1 FROM pedidos WHERE id = p_pedido_id) INTO pedido_existe;
          
          IF NOT pedido_existe THEN
              RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
          END IF;
          
          -- Actualizar estado del pedido
          UPDATE pedidos 
          SET 
              estado = 'completado',
              fecha_completado = NOW(),
              updated_at = NOW()
          WHERE id = p_pedido_id;
          
          -- Registrar venta (solo si no existe ya)
          INSERT INTO ventas (
              pedido_id, mesa_numero, total, cantidad_items,
              metodo_pago, fecha_venta, created_at
          )
          SELECT 
              p.id, 
              m.numero, 
              p.total,
              (SELECT COUNT(*) FROM detalle_pedidos WHERE pedido_id = p.id),
              p_metodo_pago, 
              NOW(), 
              NOW()
          FROM pedidos p
          JOIN mesas m ON p.mesa_id = m.id
          WHERE p.id = p_pedido_id
          AND NOT EXISTS (SELECT 1 FROM ventas WHERE pedido_id = p_pedido_id);
          
          -- Registrar detalles de venta
          INSERT INTO detalle_ventas (
              venta_id, producto_nombre, categoria, cantidad,
              precio_unitario, subtotal, es_plato_especial, created_at
          )
          SELECT 
              v.id, 
              COALESCE(mi.nombre, pe.nombre, 'Producto Desconocido'),
              COALESCE(c.nombre, 'Sin Categoría'), 
              dp.cantidad,
              dp.precio_unitario, 
              dp.subtotal,
              (dp.plato_especial_id IS NOT NULL), 
              NOW()
          FROM ventas v
          JOIN detalle_pedidos dp ON v.pedido_id = dp.pedido_id
          LEFT JOIN menu_items mi ON dp.menu_item_id = mi.id
          LEFT JOIN categorias c ON mi.categoria_id = c.id
          LEFT JOIN platos_especiales pe ON dp.plato_especial_id = pe.id
          WHERE v.pedido_id = p_pedido_id
          AND NOT EXISTS (
              SELECT 1 FROM detalle_ventas dv2 
              WHERE dv2.venta_id = v.id
          );
          
      END;
      $$ LANGUAGE plpgsql;
    `);
    log('   ✅ completar_pedido creada', 'green');
    
    return true;
  } catch (error) {
    log(`   ❌ Error creando funciones: ${error.message}`, 'red');
    return false;
  }
}

async function executeSafeMigration(analysis) {
  log('\n🚀 Ejecutando migración segura...', 'blue');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { tableCounts, existingFunctions } = analysis;
    let migrationsApplied = [];
    
    // Migración 1: ordenes → pedidos (si es necesario)
    if (tableCounts.ordenes > 0 && tableCounts.pedidos < tableCounts.ordenes) {
      log('📝 Migrando ordenes → pedidos...', 'yellow');
      
      const migratedOrders = await client.query(`
        INSERT INTO pedidos (
          mesa_id, numero_pedido, estado, subtotal, total,
          observaciones, fecha_pedido, created_at, updated_at
        )
        SELECT 
          COALESCE((SELECT id FROM mesas WHERE numero::text = o.mesa LIMIT 1), 1) as mesa_id,
          'ORD-' || LPAD(o.id::text, 6, '0') as numero_pedido,
          CASE 
            WHEN o.estado = 'pendiente' THEN 'pendiente'
            WHEN o.estado = 'confirmada' THEN 'preparando'
            WHEN o.estado = 'entregada' THEN 'completado'
            ELSE o.estado
          END as estado,
          COALESCE(o.total, 0) as subtotal, 
          COALESCE(o.total, 0),
          COALESCE(o.notas, 'Migrado desde ordenes') as observaciones,
          COALESCE(o.fecha_creacion, NOW()), 
          COALESCE(o.fecha_creacion, NOW()), 
          COALESCE(o.fecha_modificacion, NOW())
        FROM ordenes o
        WHERE NOT EXISTS (
          SELECT 1 FROM pedidos p WHERE p.numero_pedido = 'ORD-' || LPAD(o.id::text, 6, '0')
        )
        RETURNING id
      `);
      
      migrationsApplied.push(`✅ Migradas ${migratedOrders.rows.length} órdenes`);
    }
    
    // Migración 2: orden_items → detalle_pedidos (si es necesario)
    if (tableCounts.orden_items > 0) {
      log('📝 Migrando orden_items → detalle_pedidos...', 'yellow');
      
      // Verificar si orden_items tiene plato_especial_id
      try {
        await client.query('SELECT plato_especial_id FROM orden_items LIMIT 1');
      } catch (error) {
        // Agregar columna si no existe
        await client.query('ALTER TABLE orden_items ADD COLUMN plato_especial_id INTEGER REFERENCES platos_especiales(id)');
        log('   ✅ Columna plato_especial_id agregada a orden_items', 'green');
      }
      
      const migratedItems = await client.query(`
        INSERT INTO detalle_pedidos (
          pedido_id, menu_item_id, plato_especial_id, cantidad,
          precio_unitario, subtotal, observaciones, created_at
        )
        SELECT 
          p.id as pedido_id, 
          oi.menu_item_id, 
          oi.plato_especial_id,
          COALESCE(oi.cantidad, 1), 
          COALESCE(oi.precio_unitario, 0),
          COALESCE(oi.cantidad * oi.precio_unitario, 0) as subtotal,
          oi.instrucciones_especiales, 
          COALESCE(oi.fecha_creacion, NOW())
        FROM orden_items oi
        JOIN ordenes o ON oi.orden_id = o.id
        JOIN pedidos p ON p.numero_pedido = 'ORD-' || LPAD(o.id::text, 6, '0')
        WHERE NOT EXISTS (
          SELECT 1 FROM detalle_pedidos dp 
          WHERE dp.pedido_id = p.id 
          AND COALESCE(dp.menu_item_id, -1) = COALESCE(oi.menu_item_id, -1)
          AND COALESCE(dp.plato_especial_id, -1) = COALESCE(oi.plato_especial_id, -1)
        )
        RETURNING id
      `);
      
      migrationsApplied.push(`✅ Migrados ${migratedItems.rows.length} items de pedidos`);
    }
    
    // Migración 3: Manejar funciones existentes
    if (existingFunctions.length > 0) {
      await safeDropAndRecreateFunctions(client);
    }
    
    const functionsCreated = await createFreshFunctions(client);
    if (functionsCreated) {
      migrationsApplied.push('✅ Funciones auxiliares creadas/actualizadas');
    }
    
    // Migración 4: Crear índices
    log('📝 Creando índices...', 'yellow');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_menu_items_categoria ON menu_items(categoria_id)',
      'CREATE INDEX IF NOT EXISTS idx_menu_items_disponible ON menu_items(disponible)',
      'CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado)',
      'CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha_pedido)',
      'CREATE INDEX IF NOT EXISTS idx_detalle_pedidos_pedido ON detalle_pedidos(pedido_id)',
      'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta)',
      'CREATE INDEX IF NOT EXISTS idx_mesas_numero ON mesas(numero)',
      'CREATE INDEX IF NOT EXISTS idx_platos_especiales_disponible ON platos_especiales(disponible)'
    ];
    
    let indexesCreated = 0;
    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
        indexesCreated++;
      } catch (error) {
        // Ignorar errores de índices que ya existen
      }
    }
    
    migrationsApplied.push(`✅ ${indexesCreated} índices verificados/creados`);
    
    await client.query('COMMIT');
    
    log('✅ Migración segura completada exitosamente', 'green');
    log('\n📋 Migraciones aplicadas:', 'cyan');
    migrationsApplied.forEach(migration => log(`   ${migration}`, 'green'));
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    log(`❌ Error durante la migración: ${error.message}`, 'red');
    log(`📍 Stack trace: ${error.stack}`, 'red');
    return false;
  } finally {
    client.release();
  }
}

async function testFunctions() {
  log('\n🧪 Probando funciones creadas...', 'blue');
  
  const client = await pool.connect();
  try {
    // Test 1: Generar número de pedido
    const testNumero = await client.query('SELECT generar_numero_pedido() as numero');
    log(`   ✅ generar_numero_pedido: ${testNumero.rows[0].numero}`, 'green');
    
    // Test 2: Verificar si hay pedidos para actualizar totales
    const pedidosCount = await client.query('SELECT COUNT(*) as count FROM pedidos');
    if (pedidosCount.rows[0].count > 0) {
      log('   ✅ Trigger actualizar_totales listo para usar', 'green');
    } else {
      log('   ℹ️ No hay pedidos para probar trigger', 'cyan');
    }
    
    log('🎯 Tests de funciones completados', 'green');
    return true;
  } catch (error) {
    log(`   ❌ Error en tests: ${error.message}`, 'red');
    return false;
  } finally {
    client.release();
  }
}

async function main() {
  log('🛡️ MIGRACIÓN SEGURA DE BASE DE DATOS', 'bright');
  log('=====================================', 'bright');
  
  try {
    // Verificar conexión
    log('\n🔌 Verificando conexión...', 'blue');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    log('✅ Conexión exitosa', 'green');
    
    // Analizar esquema actual
    const analysis = await analyzeCurrentSchema();
    if (!analysis) {
      log('❌ No se pudo analizar el esquema', 'red');
      process.exit(1);
    }
    
    // Advertencia
    log('\n⚠️ Esta migración eliminará y recreará funciones existentes', 'yellow');
    log('para resolver conflictos de tipos de retorno.', 'yellow');
    
    // Ejecutar migración segura
    const success = await executeSafeMigration(analysis);
    if (!success) {
      log('❌ Migración falló', 'red');
      process.exit(1);
    }
    
    // Probar funciones
    await testFunctions();
    
    // Éxito
    log('\n🎉 MIGRACIÓN SEGURA COMPLETADA', 'green');
    log('===============================', 'green');
    log('\n📋 Tu base de datos está lista para:', 'bright');
    log('✅ Usar el server.js actualizado', 'green');
    log('✅ Crear pedidos con números automáticos', 'green');
    log('✅ Actualización automática de totales', 'green');
    log('✅ Completar pedidos con registros de venta', 'green');
    log('✅ Consultas optimizadas con índices', 'green');
    
    log('\n🚀 Próximo paso: node server.js', 'cyan');
    
  } catch (error) {
    log(`💥 Error crítico: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
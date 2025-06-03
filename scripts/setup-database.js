// scripts/setup-supabase.js - Configuración para Supabase
const { Pool } = require('pg');
require('dotenv').config();

console.log('☁️ Configurando base de datos en Supabase...');

// Configuración para Supabase (CORREGIDA)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh',
  host: process.env.DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD, // REQUERIDO
  port: process.env.DB_PORT || 6543, // Puerto correcto del pooler
  ssl: {
    rejectUnauthorized: false // OBLIGATORIO para Supabase
  },
  max: 5, // Límite para setup
  connectionTimeoutMillis: 10000 // Más tiempo para conexión inicial
});

async function testConnection() {
  let client;
  try {
    console.log('🔌 Probando conexión a Supabase...');
    console.log(`   Host: ${process.env.DB_HOST || 'db.ugcrigkvfejqlsoqnxxh.supabase.co'}`);
    console.log(`   Database: ${process.env.DB_NAME || 'postgres'}`);
    console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
    
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as timestamp, version() as version');
    
    console.log('✅ Conexión a Supabase exitosa');
    console.log(`   Timestamp: ${result.rows[0].timestamp}`);
    console.log(`   Versión PostgreSQL: ${result.rows[0].version.split(' ')[1]}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error conectando a Supabase:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.error('💡 Error de DNS - verifica el host de Supabase');
    } else if (error.code === '28P01') {
      console.error('💡 Autenticación fallida - verifica tu contraseña de Supabase');
    } else if (error.message.includes('SSL')) {
      console.error('💡 Error SSL - verifica configuración SSL');
    }
    
    console.error('\n🔧 Verifica:');
    console.error('   1. DB_PASSWORD configurado en .env');
    console.error('   2. Conexión a internet activa');
    console.error('   3. Credenciales correctas de Supabase');
    
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Inicializando base de datos en Supabase...');
    
    // Script SQL para crear todas las tablas necesarias
    const sqlScript = `
      -- Crear extensiones necesarias
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Tabla de usuarios
      CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          telefono VARCHAR(20),
          direccion TEXT,
          rol VARCHAR(20) DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin', 'mesero')),
          activo BOOLEAN DEFAULT true,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de categorías
      CREATE TABLE IF NOT EXISTS categorias (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          descripcion TEXT,
          imagen VARCHAR(255),
          activo BOOLEAN DEFAULT true,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de items del menú
      CREATE TABLE IF NOT EXISTS menu_items (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          descripcion TEXT,
          precio DECIMAL(10,2) NOT NULL,
          categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
          imagen VARCHAR(255),
          ingredientes TEXT,
          disponible BOOLEAN DEFAULT true,
          vegetariano BOOLEAN DEFAULT false,
          picante BOOLEAN DEFAULT false,
          tiempo_preparacion INTEGER DEFAULT 0,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          es_especial BOOLEAN DEFAULT false,
          vegano BOOLEAN DEFAULT false,
          sin_gluten BOOLEAN DEFAULT false,
          calorias INTEGER
      );

      -- Tabla de platos especiales
      CREATE TABLE IF NOT EXISTS platos_especiales (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          precio DECIMAL(10,2) NOT NULL,
          descripcion TEXT,
          disponible BOOLEAN DEFAULT true,
          fecha_inicio DATE DEFAULT CURRENT_DATE,
          fecha_fin DATE,
          imagen_url VARCHAR(255),
          tiempo_preparacion INTEGER DEFAULT 0,
          ingredientes TEXT,
          alergenos TEXT,
          calorias INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          vegetariano BOOLEAN DEFAULT false,
          picante BOOLEAN DEFAULT false
      );

      -- Tabla de mesas
      CREATE TABLE IF NOT EXISTS mesas (
          id SERIAL PRIMARY KEY,
          numero INTEGER UNIQUE NOT NULL,
          capacidad INTEGER NOT NULL,
          ubicacion VARCHAR(50),
          disponible BOOLEAN DEFAULT true,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabla de órdenes
      CREATE TABLE IF NOT EXISTS ordenes (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          total DECIMAL(10,2) NOT NULL,
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'preparando', 'lista', 'entregada', 'cancelada')),
          direccion_entrega TEXT,
          metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia')),
          notas TEXT,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          tipo_orden VARCHAR(20) DEFAULT 'mesa',
          mesa VARCHAR(20)
      );

      -- Tabla de items de la orden
      CREATE TABLE IF NOT EXISTS orden_items (
          id SERIAL PRIMARY KEY,
          orden_id INTEGER REFERENCES ordenes(id) ON DELETE CASCADE,
          menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
          plato_especial_id INTEGER REFERENCES platos_especiales(id) ON DELETE CASCADE,
          cantidad INTEGER NOT NULL CHECK (cantidad > 0),
          precio_unitario DECIMAL(10,2) NOT NULL,
          instrucciones_especiales TEXT,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (
              (menu_item_id IS NOT NULL AND plato_especial_id IS NULL) OR
              (menu_item_id IS NULL AND plato_especial_id IS NOT NULL)
          )
      );

      -- Tabla de reservaciones
      CREATE TABLE IF NOT EXISTS reservaciones (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          mesa_id INTEGER REFERENCES mesas(id) ON DELETE CASCADE,
          fecha DATE NOT NULL,
          hora TIME NOT NULL,
          numero_personas INTEGER NOT NULL CHECK (numero_personas > 0),
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
          solicitudes_especiales TEXT,
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para mejorar el performance
      CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
      CREATE INDEX IF NOT EXISTS idx_menu_items_categoria ON menu_items(categoria_id);
      CREATE INDEX IF NOT EXISTS idx_ordenes_usuario ON ordenes(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_orden_items_orden ON orden_items(orden_id);
      CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
      CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes(fecha_creacion);

      -- Función para actualizar fecha de modificación
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $
      BEGIN
          NEW.fecha_modificacion = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $ language 'plpgsql';

      -- Triggers para actualizar fecha de modificación
      DROP TRIGGER IF EXISTS update_usuarios_updated_at ON usuarios;
      CREATE TRIGGER update_usuarios_updated_at
          BEFORE UPDATE ON usuarios
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_categorias_updated_at ON categorias;
      CREATE TRIGGER update_categorias_updated_at
          BEFORE UPDATE ON categorias
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
      CREATE TRIGGER update_menu_items_updated_at
          BEFORE UPDATE ON menu_items
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_mesas_updated_at ON mesas;
      CREATE TRIGGER update_mesas_updated_at
          BEFORE UPDATE ON mesas
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_ordenes_updated_at ON ordenes;
      CREATE TRIGGER update_ordenes_updated_at
          BEFORE UPDATE ON ordenes
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `;
    
    console.log('📄 Ejecutando script de inicialización...');
    await client.query(sqlScript);
    
    console.log('✅ Estructura de base de datos creada exitosamente!');
    
    // Insertar datos iniciales solo si no existen
    await insertInitialData(client);
    
    // Verificar datos
    const userCount = await client.query('SELECT COUNT(*) FROM usuarios');
    console.log(`👥 ${userCount.rows[0].count} usuarios en total`);
    
    const categoriesCount = await client.query('SELECT COUNT(*) FROM categorias');
    console.log(`📂 ${categoriesCount.rows[0].count} categorías creadas`);
    
    const menuCount = await client.query('SELECT COUNT(*) FROM menu_items');
    console.log(`🍽️ ${menuCount.rows[0].count} items del menú`);
    
    const mesasCount = await client.query('SELECT COUNT(*) FROM mesas');
    console.log(`🪑 ${mesasCount.rows[0].count} mesas configuradas`);
    
  } catch (error) {
    console.error('❌ Error configurando la base de datos:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function insertInitialData(client) {
  try {
    console.log('📋 Insertando datos iniciales...');
    
    // Verificar si ya existen usuarios
    const existingUsers = await client.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(existingUsers.rows[0].count) === 0) {
      console.log('👤 Creando usuarios iniciales...');
      await client.query(`
        INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES 
        ('Administrador', 'admin@restaurant.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '+56912345678', 'Dirección del restaurante', 'admin'),
        ('Cliente Prueba', 'cliente@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '+56987654321', 'Las Condes, Santiago', 'cliente'),
        ('Mesero Prueba', 'mesero@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '+56955555555', 'Restaurante', 'mesero')
      `);
    }

    // Verificar si ya existen categorías
    const existingCategories = await client.query('SELECT COUNT(*) FROM categorias');
    if (parseInt(existingCategories.rows[0].count) === 0) {
      console.log('📂 Creando categorías...');
      await client.query(`
        INSERT INTO categorias (nombre, descripcion, imagen) VALUES 
        ('Entradas', 'Platos para comenzar la experiencia gastronómica', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'),
        ('Platos Principales', 'Nuestros platos estrella y especialidades', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'),
        ('Postres', 'Dulces tentaciones para finalizar', 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'),
        ('Bebidas', 'Bebidas refrescantes y calientes', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'),
        ('Pizzas', 'Pizzas artesanales con ingredientes frescos', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400')
      `);
    }

    // Verificar si ya existen items del menú
    const existingMenu = await client.query('SELECT COUNT(*) FROM menu_items');
    if (parseInt(existingMenu.rows[0].count) === 0) {
      console.log('🍽️ Creando items del menú...');
      await client.query(`
        INSERT INTO menu_items (nombre, descripcion, precio, categoria_id, vegetariano, picante, tiempo_preparacion) VALUES 
        -- Entradas
        ('Empanadas de Pino', 'Tradicionales empanadas chilenas rellenas de carne, cebolla, huevo y aceitunas', 3500, 1, false, false, 15),
        ('Palta Reina', 'Palta rellena con camarones, mayonesa y pimentón', 4200, 1, false, false, 10),
        ('Tabla de Quesos', 'Selección de quesos artesanales con frutos secos', 6800, 1, true, false, 5),
        
        -- Platos Principales  
        ('Lomo a lo Pobre', 'Lomo de res con papas fritas, huevo frito y palta', 8900, 2, false, false, 25),
        ('Salmón Grillado', 'Salmón fresco a la parrilla con verduras asadas', 9500, 2, false, false, 20),
        ('Pollo al Curry', 'Pechuga de pollo en salsa de curry con arroz', 7800, 2, false, true, 30),
        
        -- Pizzas
        ('Pizza Margherita', 'Salsa de tomate, mozzarella fresca y albahaca', 7200, 5, true, false, 18),
        ('Pizza Pepperoni', 'Salsa de tomate, mozzarella y pepperoni premium', 8400, 5, false, false, 18),
        
        -- Postres
        ('Tiramisu', 'Clásico postre italiano con café y mascarpone', 4200, 3, true, false, 10),
        ('Cheesecake', 'Tarta de queso cremosa con frutos rojos', 3800, 3, true, false, 8),
        
        -- Bebidas
        ('Jugo de Naranja', 'Jugo de naranja recién exprimido', 2800, 4, true, false, 5),
        ('Café Americano', 'Café de grano premium', 2200, 4, true, false, 3),
        ('Limonada', 'Limonada fresca con menta', 2500, 4, true, false, 5)
      `);
    }

    // Verificar si ya existen mesas
    const existingTables = await client.query('SELECT COUNT(*) FROM mesas');
    if (parseInt(existingTables.rows[0].count) === 0) {
      console.log('🪑 Creando mesas...');
      await client.query(`
        INSERT INTO mesas (numero, capacidad, ubicacion) VALUES 
        (1, 2, 'interior'),
        (2, 4, 'interior'),
        (3, 4, 'interior'),
        (4, 6, 'interior'),
        (5, 2, 'terraza'),
        (6, 4, 'terraza'),
        (7, 6, 'terraza'),
        (8, 4, 'privado')
      `);
    }

    // Insertar algunos platos especiales de ejemplo
    const existingSpecials = await client.query('SELECT COUNT(*) FROM platos_especiales');
    if (parseInt(existingSpecials.rows[0].count) === 0) {
      console.log('⭐ Creando platos especiales de ejemplo...');
      await client.query(`
        INSERT INTO platos_especiales (nombre, precio, descripcion, vegetariano, picante, tiempo_preparacion) VALUES 
        ('Paella del Chef', 15000, 'Paella tradicional española con mariscos frescos del día', false, false, 35),
        ('Risotto de Hongos', 12000, 'Risotto cremoso con mezcla de hongos silvestres', true, false, 25),
        ('Ceviche Peruano', 11000, 'Pescado fresco marinado en limón con ají y cebolla morada', false, true, 15)
      `);
    }
    
    console.log('✅ Datos iniciales insertados correctamente');
    
  } catch (error) {
    console.error('❌ Error insertando datos iniciales:', error.message);
    // No lanzar error para que continúe el setup
  }
}

async function verifySetup() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 Verificando configuración...');
    
    // Verificar tablas principales
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('usuarios', 'categorias', 'menu_items', 'mesas', 'ordenes', 'orden_items', 'platos_especiales', 'reservaciones')
      ORDER BY table_name
    `);
    
    const foundTables = tables.rows.map(t => t.table_name);
    console.log('📋 Tablas creadas:', foundTables);
    
    // Verificar usuario admin
    const adminUser = await client.query("SELECT email FROM usuarios WHERE rol = 'admin' LIMIT 1");
    if (adminUser.rows.length > 0) {
      console.log('👑 Usuario admin disponible:', adminUser.rows[0].email);
    }
    
    // Verificar datos básicos
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM usuarios) as usuarios,
        (SELECT COUNT(*) FROM categorias) as categorias,
        (SELECT COUNT(*) FROM menu_items) as menu_items,
        (SELECT COUNT(*) FROM mesas) as mesas,
        (SELECT COUNT(*) FROM platos_especiales) as platos_especiales
    `);
    
    const data = counts.rows[0];
    console.log('\n📊 Resumen de datos:');
    console.log(`   • ${data.usuarios} usuarios`);
    console.log(`   • ${data.categorias} categorías`);
    console.log(`   • ${data.menu_items} items del menú`);
    console.log(`   • ${data.mesas} mesas`);
    console.log(`   • ${data.platos_especiales} platos especiales`);
    
    return true;
  } catch (error) {
    console.error('❌ Error en verificación:', error.message);
    return false;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 Iniciando configuración de Supabase...\n');
  
  try {
    // Verificar variables de entorno
    if (!process.env.DB_PASSWORD) {
      console.error('❌ DB_PASSWORD no está configurado');
      console.error('💡 Configura tu contraseña de Supabase en el archivo .env:');
      console.error('   DB_PASSWORD=tu_password_de_supabase');
      process.exit(1);
    }
    
    // Test de conexión
    const connected = await testConnection();
    if (!connected) {
      process.exit(1);
    }
    
    // Configurar base de datos
    await setupDatabase();
    
    // Verificar configuración
    const verified = await verifySetup();
    if (!verified) {
      console.log('⚠️ Verificación completada con advertencias');
    }
    
    console.log('\n🎉 ¡Configuración de Supabase completada exitosamente!');
    console.log('\n🔐 Credenciales por defecto:');
    console.log('   Admin: admin@restaurant.com / admin123');
    console.log('   Cliente: cliente@test.com / cliente123');
    console.log('   Mesero: mesero@test.com / mesero123');
    console.log('\n🔗 Ahora puedes:');
    console.log('   1. Iniciar el servidor: npm start');
    console.log('   2. Probar la API: http://localhost:3000/api/health');
    console.log('   3. Conectar tu app móvil al servidor');
    
  } catch (error) {
    console.error('\n❌ Error en la configuración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupDatabase, testConnection, verifySetup };
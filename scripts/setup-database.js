// setup-supabase.js - Configuración inicial para Supabase
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuración de conexión usando URL o parámetros individuales
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: {
    rejectUnauthorized: false, // Necesario para Supabase
  },
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando configuración de Supabase...');
    
    // 1. Verificar conexión
    console.log('📡 Verificando conexión...');
    const connectionTest = await client.query('SELECT NOW() as current_time, version()');
    console.log('✅ Conectado a PostgreSQL:', connectionTest.rows[0].current_time);
    
    // 2. Verificar si las tablas ya existen
    console.log('🔍 Verificando tablas existentes...');
    const tablesExist = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('usuarios', 'categorias', 'productos', 'mesas', 'platos_especiales')
    `);
    
    if (tablesExist.rows.length > 0) {
      console.log('📋 Tablas encontradas:', tablesExist.rows.map(t => t.table_name));
      console.log('⚠️  Las tablas ya existen. ¿Quieres continuar? (Esto recreará todo)');
    }
    
    // 3. Ejecutar migración completa
    console.log('🏗️  Creando estructura de base de datos...');
    
    // Eliminar tablas existentes si es necesario
    await client.query('DROP TABLE IF EXISTS detalle_pedidos CASCADE');
    await client.query('DROP TABLE IF EXISTS orden_items CASCADE');
    await client.query('DROP TABLE IF EXISTS detalle_ventas CASCADE');
    await client.query('DROP TABLE IF EXISTS ventas CASCADE');
    await client.query('DROP TABLE IF EXISTS pedidos CASCADE');
    await client.query('DROP TABLE IF EXISTS ordenes CASCADE');
    await client.query('DROP TABLE IF EXISTS reservaciones CASCADE');
    await client.query('DROP TABLE IF EXISTS inventario CASCADE');
    await client.query('DROP TABLE IF EXISTS productos CASCADE');
    await client.query('DROP TABLE IF EXISTS platos_especiales CASCADE');
    await client.query('DROP TABLE IF EXISTS mesas CASCADE');
    await client.query('DROP TABLE IF EXISTS categorias CASCADE');
    await client.query('DROP TABLE IF EXISTS usuarios CASCADE');
    await client.query('DROP TABLE IF EXISTS configuracion CASCADE');
    
    // Crear tablas principales
    console.log('👥 Creando tabla usuarios...');
    await client.query(`
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        telefono VARCHAR(20),
        direccion TEXT,
        rol VARCHAR(20) DEFAULT 'cliente' CHECK (rol IN ('admin', 'mesero', 'chef', 'cliente')),
        activo BOOLEAN DEFAULT true,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('📂 Creando tabla categorías...');
    await client.query(`
      CREATE TABLE categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        imagen TEXT,
        activo BOOLEAN DEFAULT true,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('🪑 Creando tabla mesas...');
    await client.query(`
      CREATE TABLE mesas (
        id SERIAL PRIMARY KEY,
        numero INTEGER UNIQUE NOT NULL,
        capacidad INTEGER NOT NULL DEFAULT 2,
        ubicacion VARCHAR(50) DEFAULT 'interior',
        activa BOOLEAN DEFAULT true,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('🍽️ Creando tabla productos...');
    await client.query(`
      CREATE TABLE productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
        categoria_id INTEGER REFERENCES categorias(id),
        imagen TEXT,
        ingredientes TEXT,
        disponible BOOLEAN DEFAULT true,
        vegetariano BOOLEAN DEFAULT false,
        vegano BOOLEAN DEFAULT false,
        sin_gluten BOOLEAN DEFAULT false,
        picante BOOLEAN DEFAULT false,
        tiempo_preparacion INTEGER DEFAULT 0,
        calorias INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('⭐ Creando tabla platos especiales...');
    await client.query(`
      CREATE TABLE platos_especiales (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
        descripcion TEXT,
        disponible BOOLEAN DEFAULT true,
        fecha_inicio DATE DEFAULT CURRENT_DATE,
        fecha_fin DATE,
        imagen_url TEXT,
        tiempo_preparacion INTEGER DEFAULT 0,
        ingredientes TEXT,
        alergenos TEXT,
        calorias INTEGER,
        vegetariano BOOLEAN DEFAULT false,
        vegano BOOLEAN DEFAULT false,
        sin_gluten BOOLEAN DEFAULT false,
        picante BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('📋 Creando tabla pedidos...');
    await client.query(`
      CREATE TABLE pedidos (
        id SERIAL PRIMARY KEY,
        mesa_id INTEGER REFERENCES mesas(id),
        numero_pedido VARCHAR(20) UNIQUE NOT NULL,
        estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
        subtotal DECIMAL(10,2) DEFAULT 0,
        descuento DECIMAL(10,2) DEFAULT 0,
        impuestos DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) DEFAULT 0,
        observaciones TEXT,
        fecha_pedido TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_entrega TIMESTAMP WITH TIME ZONE,
        fecha_completado TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('🛒 Creando tabla ordenes (compatibilidad)...');
    await client.query(`
      CREATE TABLE ordenes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        total DECIMAL(10,2) NOT NULL DEFAULT 0,
        estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'preparando', 'lista', 'entregada', 'cancelada')),
        direccion_entrega TEXT,
        metodo_pago VARCHAR(50) DEFAULT 'efectivo',
        notas TEXT,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        fecha_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        tipo_orden VARCHAR(20) DEFAULT 'mesa',
        mesa VARCHAR(20)
      )
    `);
    
    console.log('📄 Creando tabla orden_items...');
    await client.query(`
      CREATE TABLE orden_items (
        id SERIAL PRIMARY KEY,
        orden_id INTEGER REFERENCES ordenes(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES productos(id),
        plato_especial_id INTEGER REFERENCES platos_especiales(id),
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        precio_unitario DECIMAL(10,2) NOT NULL,
        instrucciones_especiales TEXT,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT orden_items_check_producto CHECK (
          (menu_item_id IS NOT NULL AND plato_especial_id IS NULL) OR
          (menu_item_id IS NULL AND plato_especial_id IS NOT NULL)
        )
      )
    `);
    
    // 4. Insertar datos iniciales
    console.log('📊 Insertando datos iniciales...');
    
    // Usuarios
    const adminPassword = await bcrypt.hash('admin123', 12);
    const meseroPassword = await bcrypt.hash('mesero123', 12);
    
    await client.query(`
      INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES 
      ('Administrador', 'admin@restaurant.com', $1, '+56912345678', 'Dirección del restaurante', 'admin'),
      ('Mesero Prueba', 'mesero@restaurant.com', $2, '+56987654321', 'Dirección mesero', 'mesero')
    `, [adminPassword, meseroPassword]);
    
    // Categorías
    await client.query(`
      INSERT INTO categorias (nombre, descripcion, imagen) VALUES 
      ('Entradas', 'Platos para comenzar la experiencia gastronómica', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'),
      ('Platos Principales', 'Nuestros platos estrella y especialidades', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'),
      ('Postres', 'Dulces tentaciones para finalizar', 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'),
      ('Bebidas', 'Bebidas refrescantes y calientes', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'),
      ('Pizzas', 'Pizzas artesanales con ingredientes frescos', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400')
    `);
    
    // Mesas
    await client.query(`
      INSERT INTO mesas (numero, capacidad, ubicacion) VALUES 
      (1, 2, 'interior'), (2, 4, 'interior'), (3, 4, 'interior'), (4, 6, 'interior'),
      (5, 2, 'terraza'), (6, 4, 'terraza'), (7, 6, 'terraza'), (8, 4, 'privado')
    `);
    
    // Productos
    await client.query(`
      INSERT INTO productos (nombre, descripcion, precio, categoria_id, disponible, vegetariano, picante) VALUES 
      ('Tacos Al Pastor', 'Tortilla de maíz con carne de cerdo adobado, cebolla y cilantro', 5000.00, 2, true, false, true),
      ('Tacos de Alambre', 'Tortilla de maíz con proteínas de pollo y verduras, cilantro', 5000.00, 2, true, false, false),
      ('Tacos de Choriqueso', 'Tortilla de maíz con chorizo desmenuzado con queso, cebolla y cilantro', 5000.00, 2, true, false, false),
      ('Tacos de Choripapa', 'Tortilla de maíz con choriqueso desmenuzado y papas salteadas', 5000.00, 2, true, false, false),
      ('Coca Cola', 'Bebida refrescante', 2000.00, 4, true, false, false),
      ('Agua de Horchata', 'Bebida tradicional mexicana', 2000.00, 4, true, true, false)
    `);
    
    // Platos especiales
    await client.query(`
      INSERT INTO platos_especiales (nombre, precio, descripcion, disponible, vegetariano, picante) VALUES 
      ('Birria', 9000.00, 'Guiso de carne de cerdo y consomé, cebolla y cilantro', true, false, true),
      ('Chilaquiles', 7000.00, 'Tortillas fritas con salsa verde o roja, crema y queso', true, true, false),
      ('Pozole', 9000.00, 'Sopa tradicional mexicana con maíz pozolero', true, false, false)
    `);
    
    // 5. Crear índices
    console.log('🔍 Creando índices...');
    await client.query('CREATE INDEX idx_usuarios_email ON usuarios(email)');
    await client.query('CREATE INDEX idx_productos_categoria ON productos(categoria_id)');
    await client.query('CREATE INDEX idx_productos_disponible ON productos(disponible)');
    await client.query('CREATE INDEX idx_platos_especiales_disponible ON platos_especiales(disponible)');
    await client.query('CREATE INDEX idx_ordenes_usuario ON ordenes(usuario_id)');
    await client.query('CREATE INDEX idx_ordenes_estado ON ordenes(estado)');
    
    // 6. Verificar datos insertados
    console.log('✅ Verificando datos insertados...');
    const usuarios = await client.query('SELECT COUNT(*) FROM usuarios');
    const categorias = await client.query('SELECT COUNT(*) FROM categorias');
    const productos = await client.query('SELECT COUNT(*) FROM productos');
    const mesas = await client.query('SELECT COUNT(*) FROM mesas');
    const especiales = await client.query('SELECT COUNT(*) FROM platos_especiales');
    
    console.log('📊 Resumen de datos:');
    console.log(`   👥 Usuarios: ${usuarios.rows[0].count}`);
    console.log(`   📂 Categorías: ${categorias.rows[0].count}`);
    console.log(`   🍽️  Productos: ${productos.rows[0].count}`);
    console.log(`   🪑 Mesas: ${mesas.rows[0].count}`);
    console.log(`   ⭐ Platos especiales: ${especiales.rows[0].count}`);
    
    console.log('\n🎉 ¡Configuración de Supabase completada exitosamente!');
    console.log('\n🔑 Credenciales de acceso:');
    console.log('   Admin: admin@restaurant.com / admin123');
    console.log('   Mesero: mesero@restaurant.com / mesero123');
    
  } catch (error) {
    console.error('❌ Error durante la configuración:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function testConnection() {
  try {
    console.log('🧪 Probando conexión a Supabase...');
    const client = await pool.connect();
    
    const result = await client.query('SELECT NOW() as tiempo, version() as version');
    console.log('✅ Conexión exitosa!');
    console.log('⏰ Tiempo del servidor:', result.rows[0].tiempo);
    console.log('📋 Versión PostgreSQL:', result.rows[0].version.split(' ')[0]);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.log('\n🔧 Pasos para solucionar:');
    console.log('1. Verifica que tu archivo .env tenga la contraseña correcta');
    console.log('2. Reemplaza [YOUR-PASSWORD] por tu contraseña real en DATABASE_URL');
    console.log('3. Asegúrate de que Supabase esté activo');
    return false;
  }
}

// Función principal
async function main() {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      process.exit(1);
    }
    
    console.log('\n¿Deseas configurar la base de datos? (esto eliminará datos existentes)');
    console.log('Presiona Ctrl+C para cancelar o espera 5 segundos para continuar...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await setupDatabase();
    
  } catch (error) {
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupDatabase, testConnection };
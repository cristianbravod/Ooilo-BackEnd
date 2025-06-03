// server.js - Adaptado para la estructura de BD real CON REPORTES CORREGIDOS
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS mejorada
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:19000', // Expo Metro Bundler
    'http://localhost:19001', // Expo DevTools
    'http://localhost:19006', // Expo Web
    // ⚠️ AGREGAR TU IP REAL AQUÍ:
    'postgresql://postgres:Comoelvinot2012@db.ugcrigkvfejqlsoqnxxh.supabase.co:5432/postgres', // Cambiar por tu IP WiFi
    'postgresql://postgres:Comoelvinot2012@db.ugcrigkvfejqlsoqnxxh.supabase.co:5432/postgres', // Tu IP actual del código
    `postgresql://postgres:Comoelvinot2012@db.ugcrigkvfejqlsoqnxxh.supabase.co:5432/postgres`, // Para Expo Go
    `postgresql://postgres:Comoelvinot2012@db.ugcrigkvfejqlsoqnxxh.supabase.co:5432/postgres`,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging para debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Configuración PostgreSQL (usando tu BD real)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurante_db', // Nombre correcto de tu BD
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Test de conexión inicial
async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a PostgreSQL exitosa');
    
    // Verificar tablas principales
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('usuarios', 'productos', 'categorias', 'pedidos', 'mesas', 'ordenes', 'menu_items', 'platos_especiales')
    `);
    
    console.log('📋 Tablas encontradas:', tables.rows.map(t => t.table_name));
    client.release();
    
    return true;
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error.message);
    return false;
  }
}

// Middleware de autenticación
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_123');
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found or inactive' 
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// Admin middleware
const adminMiddleware = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  next();
};

// =====================================================
// RUTAS DE AUTENTICACIÓN
// =====================================================

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, email, password, telefono, direccion } = req.body;

    console.log('📝 Intento de registro:', { email, nombre });

    // Verificar si el usuario ya existe
    const existingUser = await client.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists' 
      });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Crear usuario
    const result = await client.query(
      `INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, nombre, email, telefono, direccion, rol, fecha_creacion`,
      [nombre, email, hashedPassword, telefono || null, direccion || null, 'cliente']
    );

    const user = result.rows[0];
    
    // Generar token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret_123',
      { expiresIn: '24h' }
    );

    console.log('✅ Usuario registrado:', user.nombre);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        direccion: user.direccion,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('❌ Error en registro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Intento de login:', email);

    // Buscar usuario
    const result = await client.query('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [email]);
    if (result.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const user = result.rows[0];
    
    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Contraseña incorrecta para:', email);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generar token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret_123',
      { expiresIn: '24h' }
    );

    console.log('✅ Login exitoso:', user.nombre);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        direccion: user.direccion,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Verificar token (IMPORTANTE para tu frontend)
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ 
    success: true, 
    user: {
      id: req.user.id,
      nombre: req.user.nombre,
      email: req.user.email,
      telefono: req.user.telefono,
      direccion: req.user.direccion,
      rol: req.user.rol
    }
  });
});

// =====================================================
// RUTAS DE CATEGORÍAS
// =====================================================

app.get('/api/categorias', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE PLATOS ESPECIALES
// =====================================================

// Obtener platos especiales
app.get('/api/platos-especiales', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE disponible = true 
      AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    
    console.log(`⭐ Platos especiales: ${result.rows.length}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo platos especiales:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Crear plato especial
app.post('/api/platos-especiales', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, descripcion, fecha_fin, tiempo_preparacion, vegetariano, picante } = req.body;
    
    console.log('⭐ Creando plato especial:', nombre);
    
    const result = await client.query(
      `INSERT INTO platos_especiales (nombre, precio, descripcion, fecha_fin, tiempo_preparacion, vegetariano, picante) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nombre, precio, descripcion || null, fecha_fin || null, tiempo_preparacion || 0, vegetariano || false, picante || false]
    );
    
    console.log('✅ Plato especial creado:', result.rows[0].nombre);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando plato especial:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Actualizar plato especial
app.put('/api/platos-especiales/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, descripcion, disponible, fecha_fin, tiempo_preparacion, vegetariano, picante } = req.body;
    
    console.log('✏️ Actualizando plato especial:', req.params.id);
    
    const result = await client.query(
      `UPDATE platos_especiales 
       SET nombre = $1, precio = $2, descripcion = $3, disponible = $4, 
           fecha_fin = $5, tiempo_preparacion = $6, vegetariano = $7, picante = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [nombre, precio, descripcion, disponible, fecha_fin, tiempo_preparacion, vegetariano || false, picante || false, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Special dish not found' 
      });
    }
    
    console.log('✅ Plato especial actualizado:', result.rows[0].nombre);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando plato especial:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Eliminar plato especial
app.delete('/api/platos-especiales/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🗑️ Eliminando plato especial:', req.params.id);
    
    const result = await client.query('DELETE FROM platos_especiales WHERE id = $1 RETURNING nombre', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Special dish not found' 
      });
    }
    
    console.log('✅ Plato especial eliminado:', result.rows[0].nombre);
    res.json({ 
      success: true, 
      message: 'Special dish deleted successfully' 
    });
  } catch (error) {
    console.error('Error eliminando plato especial:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Cambiar disponibilidad de plato especial
app.patch('/api/platos-especiales/:id/disponibilidad', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { disponible } = req.body;
    
    console.log('👁️ Cambiando disponibilidad plato especial:', req.params.id, disponible);
    
    const result = await client.query(
      'UPDATE platos_especiales SET disponible = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [disponible, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Special dish not found' 
      });
    }
    
    console.log('✅ Disponibilidad de plato especial actualizada:', result.rows[0].nombre);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cambiando disponibilidad plato especial:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE MENÚ (usando tabla 'menu_items')
// =====================================================

// Obtener menú
app.get('/api/menu', async (req, res) => {
  const client = await pool.connect();
  try {
    const { categoria_id, disponible } = req.query;
    
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE c.activo = true
    `;
    const params = [];
    let paramCount = 0;

    if (categoria_id) {
      paramCount++;
      query += ` AND m.categoria_id = $${paramCount}`;
      params.push(categoria_id);
    }

    if (disponible !== undefined) {
      paramCount++;
      query += ` AND m.disponible = $${paramCount}`;
      params.push(disponible === 'true');
    }

    query += ' ORDER BY c.nombre, m.nombre';

    const result = await client.query(query, params);
    console.log(`📋 Menú obtenido: ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo menú:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Sync de menú (para tu frontend)
app.get('/api/menu/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true AND c.activo = true
      ORDER BY c.nombre, m.nombre
    `);
    
    console.log(`🔄 Sync menú: ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en sync menú:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Obtener producto específico
app.get('/api/menu/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Crear producto
app.post('/api/menu', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante } = req.body;
    
    console.log('➕ Creando producto:', nombre);
    
    const result = await client.query(
      `INSERT INTO menu_items (nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre, precio, categoria_id, descripcion || null, disponible !== false, ingredientes || null, tiempo_preparacion || 0, vegetariano || false, picante || false]
    );
    
    console.log('✅ Producto creado:', result.rows[0].nombre);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Actualizar producto
app.put('/api/menu/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante } = req.body;
    
    console.log('✏️ Actualizando producto:', req.params.id);
    
    const result = await client.query(
      `UPDATE menu_items 
       SET nombre = $1, precio = $2, categoria_id = $3, descripcion = $4, 
           disponible = $5, ingredientes = $6, tiempo_preparacion = $7, vegetariano = $8, picante = $9, fecha_modificacion = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano || false, picante || false, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    console.log('✅ Producto actualizado:', result.rows[0].nombre);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Eliminar producto
app.delete('/api/menu/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🗑️ Eliminando producto:', req.params.id);
    
    const result = await client.query('DELETE FROM menu_items WHERE id = $1 RETURNING nombre', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    console.log('✅ Producto eliminado:', result.rows[0].nombre);
    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Cambiar disponibilidad de producto
app.patch('/api/menu/:id/disponibilidad', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { disponible } = req.body;
    
    console.log('👁️ Cambiando disponibilidad:', req.params.id, disponible);
    
    const result = await client.query(
      'UPDATE menu_items SET disponible = $1, fecha_modificacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [disponible, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    console.log('✅ Disponibilidad actualizada:', result.rows[0].nombre);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cambiando disponibilidad:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE PEDIDOS (usando tabla 'ordenes')
// =====================================================

// Crear orden/pedido
app.post('/api/ordenes', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { mesa, items, total, metodo_pago } = req.body;
    const usuario_id = req.user?.id || 1; // Usar usuario autenticado o admin por defecto
    
    console.log('🛒 Creando orden para:', mesa, '- Items:', items.length);
    
    // Crear orden
    const ordenResult = await client.query(
      `INSERT INTO ordenes (usuario_id, total, estado, metodo_pago, mesa, tipo_orden) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_id, total, 'entregada', metodo_pago || 'efectivo', mesa, 'mesa']
    );
    
    const orden = ordenResult.rows[0];
    
    // Agregar items a la orden
    for (const item of items) {
      if (item.es_plato_especial) {
        // Es un plato especial
        await client.query(
          `INSERT INTO orden_items (orden_id, plato_especial_id, cantidad, precio_unitario) 
           VALUES ($1, $2, $3, $4)`,
          [orden.id, item.id, item.cantidad, item.precio]
        );
      } else {
        // Es un producto del menú regular
        await client.query(
          `INSERT INTO orden_items (orden_id, menu_item_id, cantidad, precio_unitario) 
           VALUES ($1, $2, $3, $4)`,
          [orden.id, item.id, item.cantidad, item.precio]
        );
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Orden creada:', orden.id);
    
    res.status(201).json({
      success: true,
      message: 'Orden creada exitosamente',
      orden: orden
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando orden:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE MESAS
// =====================================================

app.get('/api/mesas', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT m.*, 
             COUNT(o.id) as pedidos_pendientes,
             COALESCE(SUM(o.total), 0) as total_pendiente
      FROM mesas m
      LEFT JOIN ordenes o ON m.numero::text = o.mesa AND o.estado IN ('pendiente', 'confirmada')
      WHERE m.disponible = true
      GROUP BY m.id
      ORDER BY m.numero
    `);
    
    console.log(`🪑 Mesas obtenidas: ${result.rows.length}`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mesas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE REPORTES E INFORMES - CORREGIDAS
// =====================================================

// 🔧 NUEVO: Test de conexión para reportes
app.get('/api/reportes/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Endpoints de reportes funcionando correctamente',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/reportes/ventas',
      '/api/reportes/productos-populares', 
      '/api/reportes/mesas',
      '/api/reportes/dashboard',
      '/api/reportes/exportar'
    ]
  });
});

// 🔧 CORREGIDO: Reporte de ventas con filtros avanzados
app.get('/api/reportes/ventas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      fecha_inicio, 
      fecha_fin, 
      mesa, 
      producto,
      categoria,
      limit = 1000,
      offset = 0 
    } = req.query;
    
    console.log('📊 Generando reporte de ventas:', req.query);
    
    // 🔧 Query corregida usando la estructura real de la BD
    let query = `
      SELECT 
        o.id as orden_id,
        o.mesa,
        o.total,
        o.estado,
        o.fecha_creacion as fecha,
        o.metodo_pago,
        u.nombre as cliente_nombre,
        
        -- Datos del item (usando COALESCE para manejar NULL)
        oi.cantidad,
        oi.precio_unitario as precio,
        COALESCE(m.nombre, pe.nombre) as nombre,
        COALESCE(c.nombre, 'Especial') as categoria
        
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
      LEFT JOIN categorias c ON m.categoria_id = c.id
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    // 🔧 CLAVE: Agregar filtros con casting explícito de fechas
    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      // ✅ SOLUCIÓN: Usar CAST explícito para convertir las fechas
      query += ` AND DATE(o.fecha_creacion) BETWEEN CAST($${paramCount - 1} AS DATE) AND CAST($${paramCount} AS DATE)`;
      params.push(fecha_inicio, fecha_fin);
    }

    if (mesa && mesa !== '') {
      paramCount++;
      query += ` AND o.mesa = $${paramCount}`;
      params.push(mesa);
    }

    if (producto && producto !== '') {
      paramCount++;
      query += ` AND (LOWER(m.nombre) LIKE LOWER($${paramCount}) OR LOWER(pe.nombre) LIKE LOWER($${paramCount}))`;
      params.push(`%${producto}%`);
    }

    if (categoria && categoria !== '') {
      paramCount++;
      query += ` AND (LOWER(c.nombre) = LOWER($${paramCount}) OR (pe.id IS NOT NULL AND LOWER($${paramCount}) = 'especial'))`;
      params.push(categoria);
    }

    query += ' ORDER BY o.fecha_creacion DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }

    if (offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(parseInt(offset));
    }

    console.log('🔍 SQL Query:', query);
    console.log('🔍 Parámetros:', params);

    const result = await client.query(query, params);
    
    // Agrupar datos por orden para el frontend
    const ventasAgrupadas = {};
    result.rows.forEach(row => {
      const ordenId = row.orden_id;
      if (!ventasAgrupadas[ordenId]) {
        ventasAgrupadas[ordenId] = {
          id: ordenId,
          mesa: row.mesa,
          fecha: row.fecha,
          total: parseFloat(row.total),
          estado: row.estado,
          metodo_pago: row.metodo_pago,
          cliente_nombre: row.cliente_nombre,
          items: []
        };
      }
      
      ventasAgrupadas[ordenId].items.push({
        nombre: row.nombre,
        cantidad: parseInt(row.cantidad),
        precio: parseFloat(row.precio),
        categoria: row.categoria
      });
    });

    const ventasFinales = Object.values(ventasAgrupadas);
    
    // Calcular estadísticas
    const totalVentas = ventasFinales.reduce((sum, venta) => sum + venta.total, 0);
    const totalItems = result.rows.reduce((sum, row) => sum + parseInt(row.cantidad), 0);

    console.log(`✅ Reporte generado: ${ventasFinales.length} órdenes`);
    
    res.json({
      success: true,
      ventas: ventasFinales,
      estadisticas: {
        total_ventas: totalVentas,
        total_items: totalItems,
        numero_ordenes: ventasFinales.length,
        promedio_orden: ventasFinales.length > 0 ? totalVentas / ventasFinales.length : 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error generando reporte:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error generando reporte de ventas', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 TAMBIÉN CORREGIR: Productos más populares
app.get('/api/reportes/productos-populares', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin, limit = 10 } = req.query;
    
    let query = `
      SELECT 
        COALESCE(m.id, pe.id) as id,
        COALESCE(m.nombre, pe.nombre) as nombre,
        COALESCE(m.precio, pe.precio) as precio,
        COALESCE(c.nombre, 'Especial') as categoria,
        SUM(oi.cantidad) as total_vendido,
        SUM(oi.cantidad * oi.precio_unitario) as ingresos_totales,
        COUNT(DISTINCT o.id) as ordenes_count
      FROM orden_items oi
      JOIN ordenes o ON oi.orden_id = o.id
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
      LEFT JOIN categorias c ON m.categoria_id = c.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    // 🔧 CLAVE: Usar CAST explícito para las fechas
    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN CAST($${paramCount - 1} AS DATE) AND CAST($${paramCount} AS DATE)`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += `
      GROUP BY COALESCE(m.id, pe.id), COALESCE(m.nombre, pe.nombre), COALESCE(m.precio, pe.precio), COALESCE(c.nombre, 'Especial')
      ORDER BY total_vendido DESC
      LIMIT $${paramCount + 1}
    `;
    params.push(parseInt(limit));

    console.log('🔍 SQL Query Productos Populares:', query);
    console.log('🔍 Parámetros:', params);

    const result = await client.query(query, params);
    
    console.log(`🏆 Productos populares: ${result.rows.length}`);
    
    res.json({
      success: true,
      productos: result.rows.map(row => ({
        ...row,
        total_vendido: parseInt(row.total_vendido),
        ingresos_totales: parseFloat(row.ingresos_totales),
        ordenes_count: parseInt(row.ordenes_count)
      }))
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo productos populares:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error obteniendo productos populares', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 TAMBIÉN CORREGIR: Reporte por mesas
app.get('/api/reportes/mesas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    
    let query = `
      SELECT 
        o.mesa,
        COUNT(DISTINCT o.id) as total_ordenes,
        SUM(o.total) as ingresos_totales,
        AVG(o.total) as promedio_orden,
        SUM(oi.cantidad) as total_items
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    // 🔧 CLAVE: Usar CAST explícito para las fechas
    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN CAST($${paramCount - 1} AS DATE) AND CAST($${paramCount} AS DATE)`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += ' GROUP BY o.mesa ORDER BY ingresos_totales DESC';

    console.log('🔍 SQL Query Mesas:', query);
    console.log('🔍 Parámetros:', params);

    const result = await client.query(query, params);
    
    console.log(`🪑 Reporte de mesas: ${result.rows.length}`);
    
    res.json({
      success: true,
      mesas: result.rows.map(row => ({
        ...row,
        total_ordenes: parseInt(row.total_ordenes),
        ingresos_totales: parseFloat(row.ingresos_totales),
        promedio_orden: parseFloat(row.promedio_orden),
        total_items: parseInt(row.total_items)
      }))
    });
    
  } catch (error) {
    console.error('❌ Error generando reporte de mesas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error generando reporte de mesas', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 TAMBIÉN CORREGIR: Estadísticas del dashboard
app.get('/api/reportes/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const queries = [
      // Órdenes de hoy - 🔧 CORREGIDO: usar CAST
      `SELECT COUNT(*) as ordenes_hoy FROM ordenes WHERE DATE(fecha_creacion) = CAST($1 AS DATE)`,
      
      // Ingresos de hoy - 🔧 CORREGIDO: usar CAST
      `SELECT COALESCE(SUM(total), 0) as ingresos_hoy FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) = CAST($1 AS DATE)`,
      
      // Órdenes pendientes
      `SELECT COUNT(*) as ordenes_pendientes FROM ordenes 
       WHERE estado IN ('pendiente', 'confirmada')`,
      
      // Órdenes del mes - 🔧 CORREGIDO: usar CAST
      `SELECT COUNT(*) as ordenes_mes FROM ordenes 
       WHERE DATE(fecha_creacion) >= CAST($2 AS DATE)`,
       
      // Ingresos del mes - 🔧 CORREGIDO: usar CAST
      `SELECT COALESCE(SUM(total), 0) as ingresos_mes FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) >= CAST($2 AS DATE)`,
      
      // Producto más vendido hoy - 🔧 CORREGIDO: usar CAST
      `SELECT COALESCE(m.nombre, pe.nombre) as nombre, SUM(oi.cantidad) as cantidad
       FROM orden_items oi
       JOIN ordenes o ON oi.orden_id = o.id
       LEFT JOIN menu_items m ON oi.menu_item_id = m.id
       LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
       WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) = CAST($1 AS DATE)
       GROUP BY COALESCE(m.nombre, pe.nombre)
       ORDER BY cantidad DESC
       LIMIT 1`,
       
      // Total de items del menú activos
      `SELECT COUNT(*) as items_menu FROM menu_items WHERE disponible = true`
    ];

    console.log('🔍 Ejecutando consultas de dashboard con fechas:', { today, startOfMonth });

    const results = await Promise.all(
      queries.map(query => {
        console.log('🔍 Query Dashboard:', query);
        return client.query(query, [today, startOfMonth]);
      })
    );

    console.log('📈 Estadísticas del dashboard generadas');

    res.json({
      success: true,
      estadisticas: {
        hoy: {
          ordenes: parseInt(results[0].rows[0].ordenes_hoy),
          ingresos: parseFloat(results[1].rows[0].ingresos_hoy)
        },
        mes: {
          ordenes: parseInt(results[3].rows[0].ordenes_mes),
          ingresos: parseFloat(results[4].rows[0].ingresos_mes)
        },
        pendientes: {
          ordenes: parseInt(results[2].rows[0].ordenes_pendientes)
        },
        menu: {
          items_activos: parseInt(results[6].rows[0].items_menu)
        },
        destacado: {
          producto_mas_vendido: results[5].rows[0] || null
        },
        fecha_generacion: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error obteniendo estadísticas del dashboard', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 CORREGIDO: Productos más populares
app.get('/api/reportes/productos-populares', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin, limit = 10 } = req.query;
    
    let query = `
      SELECT 
        COALESCE(m.id, pe.id) as id,
        COALESCE(m.nombre, pe.nombre) as nombre,
        COALESCE(m.precio, pe.precio) as precio,
        COALESCE(c.nombre, 'Especial') as categoria,
        SUM(oi.cantidad) as total_vendido,
        SUM(oi.cantidad * oi.precio_unitario) as ingresos_totales,
        COUNT(DISTINCT o.id) as ordenes_count
      FROM orden_items oi
      JOIN ordenes o ON oi.orden_id = o.id
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
      LEFT JOIN categorias c ON m.categoria_id = c.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN ${paramCount - 1} AND ${paramCount}`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += `
      GROUP BY COALESCE(m.id, pe.id), COALESCE(m.nombre, pe.nombre), COALESCE(m.precio, pe.precio), COALESCE(c.nombre, 'Especial')
      ORDER BY total_vendido DESC
      LIMIT ${paramCount + 1}
    `;
    params.push(parseInt(limit));

    const result = await client.query(query, params);
    
    console.log(`🏆 Productos populares: ${result.rows.length}`);
    
    res.json({
      success: true,
      productos: result.rows.map(row => ({
        ...row,
        total_vendido: parseInt(row.total_vendido),
        ingresos_totales: parseFloat(row.ingresos_totales),
        ordenes_count: parseInt(row.ordenes_count)
      }))
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo productos populares:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error obteniendo productos populares', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 CORREGIDO: Reporte por mesas
app.get('/api/reportes/mesas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    
    let query = `
      SELECT 
        o.mesa,
        COUNT(DISTINCT o.id) as total_ordenes,
        SUM(o.total) as ingresos_totales,
        AVG(o.total) as promedio_orden,
        SUM(oi.cantidad) as total_items
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN ${paramCount - 1} AND ${paramCount}`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += ' GROUP BY o.mesa ORDER BY ingresos_totales DESC';

    const result = await client.query(query, params);
    
    console.log(`🪑 Reporte de mesas: ${result.rows.length}`);
    
    res.json({
      success: true,
      mesas: result.rows.map(row => ({
        ...row,
        total_ordenes: parseInt(row.total_ordenes),
        ingresos_totales: parseFloat(row.ingresos_totales),
        promedio_orden: parseFloat(row.promedio_orden),
        total_items: parseInt(row.total_items)
      }))
    });
    
  } catch (error) {
    console.error('❌ Error generando reporte de mesas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error generando reporte de mesas', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 CORREGIDO: Estadísticas del dashboard
app.get('/api/reportes/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const queries = [
      // Órdenes de hoy
      `SELECT COUNT(*) as ordenes_hoy FROM ordenes WHERE DATE(fecha_creacion) = $1`,
      
      // Ingresos de hoy
      `SELECT COALESCE(SUM(total), 0) as ingresos_hoy FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) = $1`,
      
      // Órdenes pendientes
      `SELECT COUNT(*) as ordenes_pendientes FROM ordenes 
       WHERE estado IN ('pendiente', 'confirmada')`,
      
      // Órdenes del mes
      `SELECT COUNT(*) as ordenes_mes FROM ordenes 
       WHERE DATE(fecha_creacion) >= $2`,
       
      // Ingresos del mes
      `SELECT COALESCE(SUM(total), 0) as ingresos_mes FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) >= $2`,
      
      // Producto más vendido hoy
      `SELECT COALESCE(m.nombre, pe.nombre) as nombre, SUM(oi.cantidad) as cantidad
       FROM orden_items oi
       JOIN ordenes o ON oi.orden_id = o.id
       LEFT JOIN menu_items m ON oi.menu_item_id = m.id
       LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
       WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) = $1
       GROUP BY COALESCE(m.nombre, pe.nombre)
       ORDER BY cantidad DESC
       LIMIT 1`,
       
      // Total de items del menú activos
      `SELECT COUNT(*) as items_menu FROM menu_items WHERE disponible = true`
    ];

    const results = await Promise.all(
      queries.map(query => client.query(query, [today, startOfMonth]))
    );

    console.log('📈 Estadísticas del dashboard generadas');

    res.json({
      success: true,
      estadisticas: {
        hoy: {
          ordenes: parseInt(results[0].rows[0].ordenes_hoy),
          ingresos: parseFloat(results[1].rows[0].ingresos_hoy)
        },
        mes: {
          ordenes: parseInt(results[3].rows[0].ordenes_mes),
          ingresos: parseFloat(results[4].rows[0].ingresos_mes)
        },
        pendientes: {
          ordenes: parseInt(results[2].rows[0].ordenes_pendientes)
        },
        menu: {
          items_activos: parseInt(results[6].rows[0].items_menu)
        },
        destacado: {
          producto_mas_vendido: results[5].rows[0] || null
        },
        fecha_generacion: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error obteniendo estadísticas del dashboard', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// 🔧 NUEVO: Exportar datos
app.get('/api/reportes/exportar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { formato = 'json', tipo = 'ventas' } = req.query;
    
    console.log('📤 Exportando datos:', { formato, tipo });

    // Para simplicidad, devolvemos un mensaje de que la función está en desarrollo
    res.json({
      success: true,
      message: 'Función de exportación en desarrollo',
      formato_solicitado: formato,
      tipo_solicitado: tipo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error exportando datos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error exportando datos', 
      error: error.message 
    });
  }
});

// =====================================================
// HEALTH CHECK MEJORADO
// =====================================================

app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Test básico de conexión
    await client.query('SELECT 1 as test');
    
    // Contar registros principales
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM usuarios) as usuarios,
        (SELECT COUNT(*) FROM menu_items) as productos,
        (SELECT COUNT(*) FROM categorias) as categorias,
        (SELECT COUNT(*) FROM mesas) as mesas,
        (SELECT COUNT(*) FROM ordenes WHERE estado IN ('pendiente', 'confirmada')) as pedidos_activos,
        (SELECT COUNT(*) FROM platos_especiales) as platos_especiales
    `);
    
    client.release();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '2.0.0',
      tables: counts.rows[0]
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// =====================================================
// MANEJO DE ERRORES
// =====================================================

// Error 404 para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /api/health',
      'POST /api/auth/login', 
      'POST /api/auth/register',
      'GET /api/auth/verify',
      'GET /api/menu',
      'GET /api/menu/sync',
      'GET /api/categorias',
      'GET /api/platos-especiales',
      'POST /api/platos-especiales',
      'PUT /api/platos-especiales/:id',
      'DELETE /api/platos-especiales/:id',
      'PATCH /api/platos-especiales/:id/disponibilidad',
      'POST /api/menu',
      'PUT /api/menu/:id',
      'DELETE /api/menu/:id',
      'PATCH /api/menu/:id/disponibilidad',
      'POST /api/ordenes',
      'GET /api/mesas',
      'GET /api/reportes/ventas',
      'GET /api/reportes/productos-populares',
      'GET /api/reportes/mesas', 
      'GET /api/reportes/dashboard',
      'GET /api/reportes/exportar',
      'GET /api/reportes/health'
    ]
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('💥 Error global:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Manejo de promesas rechazadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

// =====================================================
// INICIALIZACIÓN DEL SERVIDOR
// =====================================================

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor del restaurante...');
    console.log('🌍 Entorno:', process.env.NODE_ENV || 'development');
    
    // Verificar conexión a la base de datos
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.log('💡 Verifica que PostgreSQL esté corriendo y las credenciales sean correctas');
      process.exit(1);
    }

    // Verificar que tengamos usuarios en la BD
    const client = await pool.connect();
    const userCount = await client.query('SELECT COUNT(*) FROM usuarios');
    console.log(`👥 Usuarios en BD: ${userCount.rows[0].count}`);
    
    if (userCount.rows[0].count === '0') {
      console.log('⚠️ No hay usuarios en la base de datos');
      console.log('💡 Ejecuta este SQL para crear un usuario admin:');
      console.log(`
-- Usuario admin (password: admin123)
INSERT INTO usuarios (nombre, email, password, telefono, rol) VALUES 
('Administrador', 'admin@restaurant.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6pc0eoAWtG', '+56912345678', 'admin');
      `);
    } else {
      console.log('✅ Usuarios encontrados en la base de datos');
    }
    
    client.release();

    // Iniciar el servidor
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🎉 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      
      // Mostrar IPs para testing
      const networkInterfaces = require('os').networkInterfaces();
      const addresses = [];
      
      for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            addresses.push(net.address);
          }
        }
      }
      
      if (addresses.length > 0) {
        console.log(`📱 Para Expo/dispositivos móviles:`);
        addresses.forEach(addr => {
          console.log(`   • http://${addr}:${PORT}/api`);
        });
        console.log(`\n⚠️ Actualiza estas IPs en tu frontend:`);
        console.log(`   AuthService.js: this.API_BASE_URL = 'http://${addresses[0]}:${PORT}/api'`);
        console.log(`   ApiService.js:  this.API_BASE_URL = 'http://${addresses[0]}:${PORT}/api'`);
      }
      
      console.log(`\n📋 Endpoints principales:`);
      console.log(`   • POST /api/auth/login           - Login de usuario`);
      console.log(`   • POST /api/auth/register        - Registro de usuario`);
      console.log(`   • GET  /api/auth/verify          - Verificar token`);
      console.log(`   • GET  /api/menu                 - Obtener menú`);
      console.log(`   • GET  /api/menu/sync            - Sincronizar menú`);
      console.log(`   • GET  /api/categorias           - Obtener categorías`);
      console.log(`   • GET  /api/platos-especiales    - Platos especiales`);
      console.log(`   • POST /api/ordenes              - Crear orden/pedido`);
      console.log(`   • GET  /api/mesas                - Obtener mesas`);
      console.log(`   • GET  /api/reportes/ventas      - Reporte de ventas`);
      console.log(`   • GET  /api/reportes/productos-populares - Productos populares`);
      console.log(`   • GET  /api/reportes/mesas       - Reporte por mesas`);
      console.log(`   • GET  /api/reportes/dashboard   - Estadísticas dashboard`);
      console.log(`   • GET  /api/reportes/health      - Health check reportes`);
      console.log(`\n✅ Servidor listo para recibir peticiones!`);
      console.log(`\n💡 Credenciales de prueba:`);
      console.log(`   Email: admin@restaurant.com`);
      console.log(`   Password: admin123`);
      console.log(`\n🧪 Para probar la API:`);
      console.log(`   1. Visita: http://localhost:${PORT}/api/health`);
      console.log(`   2. Deberías ver: {"status":"OK","database":"connected"}`);
      console.log(`   3. Actualiza las IPs en tu frontend React Native`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n📡 Recibida señal ${signal}, cerrando servidor...`);
      server.close(() => {
        console.log('🔄 Servidor HTTP cerrado');
        pool.end().then(() => {
          console.log('🗄️ Pool de conexiones cerrado');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Ejecutar servidor
if (require.main === module) {
  startServer();
}

module.exports = { app, pool };
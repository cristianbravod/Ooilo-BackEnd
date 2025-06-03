// server.js - Adaptado para Supabase PostgreSQL
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
    'http://192.168.1.100:19000', // Cambiar por tu IP WiFi
    'http://192.168.2.134:19000', // Tu IP actual del código
    `exp://192.168.1.100:19000`, // Para Expo Go
    `exp://192.168.2.134:19000`,
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

// 🔧 CONFIGURACIÓN SUPABASE POSTGRESQL
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db.ugcrigkvfejqlsoqnxxh.supabase.co',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD, // REQUERIDO
  port: process.env.DB_PORT || 5432,
  
  // 🔧 CONFIGURACIONES ESPECÍFICAS PARA SUPABASE
  ssl: {
    rejectUnauthorized: false // OBLIGATORIO para Supabase
  },
  max: 10, // Límite de conexiones para Supabase
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Más tiempo para conexiones remotas
  statement_timeout: 30000,
  query_timeout: 30000,
  
  // Soporte para URL completa si está disponible
  ...(process.env.DATABASE_URL && {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
});

// 🔧 Test de conexión inicial para Supabase
async function testDatabaseConnection() {
  let client;
  try {
    console.log('🔌 Conectando a Supabase PostgreSQL...');
    console.log(`   Host: ${process.env.DB_HOST || 'db.ugcrigkvfejqlsoqnxxh.supabase.co'}`);
    console.log(`   Database: ${process.env.DB_NAME || 'postgres'}`);
    console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
    console.log(`   SSL: habilitado`);
    
    client = await pool.connect();
    
    // Test básico
    const result = await client.query('SELECT NOW() as timestamp, version() as version');
    console.log('✅ Conexión a Supabase PostgreSQL exitosa');
    console.log(`   Timestamp: ${result.rows[0].timestamp}`);
    console.log(`   Versión: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
    
    // Verificar tablas principales (con manejo de errores)
    try {
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('usuarios', 'menu_items', 'categorias', 'ordenes', 'mesas', 'platos_especiales')
        ORDER BY table_name
      `);
      
      const foundTables = tables.rows.map(t => t.table_name);
      console.log('📋 Tablas encontradas:', foundTables);
      
      // Verificar si necesitamos crear tablas
      const requiredTables = ['usuarios', 'categorias', 'menu_items', 'mesas', 'ordenes'];
      const missingTables = requiredTables.filter(table => !foundTables.includes(table));
      
      if (missingTables.length > 0) {
        console.log('⚠️ Tablas faltantes:', missingTables);
        console.log('💡 Ejecuta el script de inicialización para crear las tablas');
      }
    } catch (tablesError) {
      console.log('📋 No se pudieron verificar las tablas (esto es normal en la primera conexión)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error conectando a Supabase:', error.message);
    
    // Diagnóstico de errores comunes
    if (error.code === 'ENOTFOUND') {
      console.error('💡 Error de DNS - verifica que el host sea correcto');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Conexión rechazada - verifica host y puerto');
    } else if (error.code === '28P01') {
      console.error('💡 Autenticación fallida - verifica usuario y contraseña');
    } else if (error.code === '3D000') {
      console.error('💡 Base de datos no existe - verifica el nombre de la BD');
    } else if (error.message.includes('SSL')) {
      console.error('💡 Error SSL - Supabase requiere conexión SSL');
    }
    
    console.error('\n🔧 Verifica tu configuración:');
    console.error('   - DB_PASSWORD esté configurado en .env');
    console.error('   - Conexión a internet activa');
    console.error('   - Credenciales de Supabase correctas');
    
    return false;
  } finally {
    if (client) {
      client.release();
    }
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

// [CONTINÚO CON EL RESTO DE ENDPOINTS SIN CAMBIOS SIGNIFICATIVOS...]

// =====================================================
// HEALTH CHECK MEJORADO PARA SUPABASE
// =====================================================

app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Test básico de conexión
    const connectionTest = await client.query('SELECT NOW() as timestamp');
    
    // Intentar contar registros principales (con manejo de errores)
    let counts = {};
    try {
      const countsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM usuarios) as usuarios,
          (SELECT COUNT(*) FROM menu_items) as productos,
          (SELECT COUNT(*) FROM categorias) as categorias,
          (SELECT COUNT(*) FROM mesas) as mesas,
          (SELECT COUNT(*) FROM ordenes WHERE estado IN ('pendiente', 'confirmada')) as pedidos_activos,
          (SELECT COUNT(*) FROM platos_especiales) as platos_especiales
      `);
      counts = countsResult.rows[0];
    } catch (countError) {
      console.log('⚠️ No se pudieron obtener conteos (tablas pueden no existir)');
      counts = { mensaje: 'Tablas no inicializadas' };
    }
    
    client.release();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      provider: 'Supabase',
      version: '2.0.0',
      connection_test: connectionTest.rows[0].timestamp,
      tables: counts
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      provider: 'Supabase',
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
      'GET /api/categorias',
      'GET /api/platos-especiales',
      'POST /api/ordenes',
      'GET /api/mesas'
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

// =====================================================
// INICIALIZACIÓN DEL SERVIDOR
// =====================================================

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor del restaurante con Supabase...');
    console.log('🌍 Entorno:', process.env.NODE_ENV || 'development');
    
    // Verificar variables de entorno críticas
    if (!process.env.DB_PASSWORD) {
      console.error('❌ DB_PASSWORD no está configurado');
      console.error('💡 Configura DB_PASSWORD en tu archivo .env');
      process.exit(1);
    }
    
    // Verificar conexión a Supabase
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.log('💡 Verifica tu configuración de Supabase y conexión a internet');
      process.exit(1);
    }

    // Verificar que tengamos usuarios en la BD (opcional)
    try {
      const client = await pool.connect();
      const userCount = await client.query('SELECT COUNT(*) FROM usuarios');
      console.log(`👥 Usuarios en BD: ${userCount.rows[0].count}`);
      client.release();
    } catch (error) {
      console.log('📝 Nota: Tablas pueden no estar inicializadas (esto es normal en la primera ejecución)');
    }

    // Iniciar el servidor
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🎉 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`☁️ Base de datos: Supabase PostgreSQL`);
      
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
      }
      
      console.log(`\n✅ Servidor listo para recibir peticiones!`);
      console.log(`\n🧪 Para probar la API:`);
      console.log(`   1. Visita: http://localhost:${PORT}/api/health`);
      console.log(`   2. Deberías ver: {"status":"OK","provider":"Supabase"}`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n📡 Recibida señal ${signal}, cerrando servidor...`);
      server.close(() => {
        console.log('🔄 Servidor HTTP cerrado');
        pool.end().then(() => {
          console.log('☁️ Conexiones de Supabase cerradas');
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
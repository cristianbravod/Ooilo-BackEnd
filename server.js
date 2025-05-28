// backend/server.js - Servidor Principal
const app = require('./src/app');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

// Configuración de base de datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Función para verificar conexión a la base de datos
async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Verificar que las tablas principales existan
    const tables = ['usuarios', 'categorias', 'menu_items', 'ordenes', 'mesas'];
    for (const table of tables) {
      const result = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      if (!result.rows[0].exists) {
        console.warn(`⚠️  Table '${table}' does not exist`);
      }
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Función para iniciar el servidor
async function startServer() {
  try {
    console.log('🚀 Starting Restaurant Management Server...');
    console.log('📊 Environment:', process.env.NODE_ENV || 'development');
    
    // Verificar conexión a la base de datos
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.log('💡 Run "npm run setup-db" to initialize the database');
      process.exit(1);
    }

    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(`\n🎉 Server running on port ${PORT}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📱 For Expo: http://${process.env.LOCAL_IP || '192.168.1.100'}:${PORT}/api`);
      console.log(`\n📋 Available Endpoints:`);
      console.log(`   • GET  /api/health                - Health check`);
      console.log(`   • POST /api/auth/login           - User login`);
      console.log(`   • POST /api/auth/register        - User registration`);
      console.log(`   • GET  /api/menu                 - Get menu items`);
      console.log(`   • GET  /api/categorias           - Get categories`);
      console.log(`   • POST /api/ordenes/quick        - Create quick order`);
      console.log(`   • GET  /api/ordenes/mesa/:mesa   - Get table orders`);
      console.log(`   • POST /api/ordenes/mesa/:mesa/cerrar - Close table`);
      console.log(`\n✅ Server ready to accept requests!\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n📡 Received SIGTERM, shutting down gracefully...');
      server.close(() => {
        console.log('🔄 HTTP server closed');
        pool.end().then(() => {
          console.log('🗄️  Database pool closed');
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', () => {
      console.log('\n📡 Received SIGINT, shutting down gracefully...');
      server.close(() => {
        console.log('🔄 HTTP server closed');
        pool.end().then(() => {
          console.log('🗄️  Database pool closed');
          process.exit(0);
        });
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Iniciar el servidor
startServer();

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
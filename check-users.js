// check-users.js - Verificar usuarios en base de datos
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function checkUsers() {
  const client = await pool.connect();
  try {
    console.log('📊 Verificando usuarios en la base de datos...\n');
    
    const result = await client.query('SELECT id, nombre, email, rol, fecha_creacion FROM usuarios ORDER BY id');
    
    if (result.rows.length === 0) {
      console.log('❌ No hay usuarios en la base de datos');
      console.log('💡 Ejecuta: npm run setup-db');
    } else {
      console.log(`✅ ${result.rows.length} usuarios encontrados:\n`);
      
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. ${user.nombre}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   👤 Rol: ${user.rol}`);
        console.log(`   📅 Creado: ${user.fecha_creacion}`);
        console.log('');
      });
    }
    
    // Verificar categorías
    const categorias = await client.query('SELECT COUNT(*) FROM categorias');
    console.log(`📂 Categorías: ${categorias.rows[0].count}`);
    
    // Verificar menú
    const menu = await client.query('SELECT COUNT(*) FROM menu_items');
    console.log(`🍽️  Items del menú: ${menu.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === '42P01') {
      console.log('💡 Las tablas no existen. Ejecuta: npm run setup-db');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkUsers();
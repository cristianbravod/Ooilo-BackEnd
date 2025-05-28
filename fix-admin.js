// fix-admin.js - Arreglar credenciales de admin
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function fixAdminCredentials() {
  const client = await pool.connect();
  try {
    console.log('🔧 Arreglando credenciales de admin...');
    
    // Generar hash correcto para "admin123"
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('🔑 Nuevo hash generado');
    
    // Actualizar usuario admin
    const result = await client.query(
      'UPDATE usuarios SET password = $1 WHERE email = $2 RETURNING id, nombre, email, rol',
      [hashedPassword, 'admin@restaurant.com']
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Usuario admin actualizado:');
      console.log('   Email: admin@restaurant.com');
      console.log('   Password: admin123');
    } else {
      console.log('❌ Usuario admin no encontrado, creándolo...');
      
      const createResult = await client.query(
        'INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        ['Administrador', 'admin@restaurant.com', hashedPassword, '+56912345678', 'Restaurante', 'admin']
      );
      
      console.log('✅ Usuario admin creado:', createResult.rows[0]);
    }
    
    console.log('\n🎉 ¡Listo! Ahora puedes hacer login con:');
    console.log('   Email: admin@restaurant.com');
    console.log('   Password: admin123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAdminCredentials();
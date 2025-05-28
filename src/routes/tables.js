// src/routes/tables.js
const express = require('express');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');
const config = require('../config/database');

const router = express.Router();
const pool = new Pool(config);

// Obtener todas las mesas
router.get('/', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mesas ORDER BY numero');
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting tables:', error);
    res.status(500).json({ message: 'Error retrieving tables', error: error.message });
  }
});

// Obtener mesa específica
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM mesas WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting table:', error);
    res.status(500).json({ message: 'Error retrieving table', error: error.message });
  }
});

// Crear nueva mesa (Admin)
router.post('/', authMiddleware, adminMiddleware, [
  body('numero').isInt({ min: 1 }).withMessage('Table number must be a positive integer'),
  body('capacidad').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  body('ubicacion').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { numero, capacidad, ubicacion } = req.body;
    
    // Verificar que no exista una mesa con el mismo número
    const existingTable = await pool.query('SELECT * FROM mesas WHERE numero = $1', [numero]);
    if (existingTable.rows.length > 0) {
      return res.status(400).json({ message: 'Table with this number already exists' });
    }
    
    const result = await pool.query(
      'INSERT INTO mesas (numero, capacidad, ubicacion) VALUES ($1, $2, $3) RETURNING *',
      [numero, capacidad, ubicacion]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ message: 'Error creating table', error: error.message });
  }
});

// Actualizar mesa (Admin)
router.put('/:id', authMiddleware, adminMiddleware, [
  body('numero').optional().isInt({ min: 1 }).withMessage('Table number must be a positive integer'),
  body('capacidad').optional().isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  body('ubicacion').optional().isString(),
  body('disponible').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;
    
    // Construir query dinámicamente
    const fields = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Agregar fecha de modificación
    paramCount++;
    fields.push(`fecha_modificacion = $${paramCount}`);
    values.push(new Date());

    // Agregar ID
    paramCount++;
    values.push(id);

    const query = `
      UPDATE mesas 
      SET ${fields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ message: 'Error updating table', error: error.message });
  }
});

// Eliminar mesa (Admin)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que no haya órdenes activas en la mesa
    const activeOrders = await pool.query(
      'SELECT COUNT(*) FROM ordenes WHERE mesa = (SELECT CONCAT(\'Mesa \', numero) FROM mesas WHERE id = $1) AND estado IN (\'pendiente\', \'confirmada\', \'preparando\')',
      [id]
    );
    
    if (parseInt(activeOrders.rows[0].count) > 0) {
      return res.status(400).json({ message: 'Cannot delete table with active orders' });
    }
    
    const result = await pool.query('DELETE FROM mesas WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    
    res.json({ message: 'Table deleted successfully', table: result.rows[0] });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ message: 'Error deleting table', error: error.message });
  }
});

// Obtener estado de mesas con órdenes activas
router.get('/estado/activo', optionalAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        m.*,
        COUNT(o.id) as ordenes_activas,
        COALESCE(SUM(o.total), 0) as total_pendiente
      FROM mesas m
      LEFT JOIN ordenes o ON CONCAT('Mesa ', m.numero) = o.mesa 
        AND o.estado IN ('pendiente', 'confirmada', 'preparando', 'lista')
      GROUP BY m.id, m.numero, m.capacidad, m.ubicacion, m.disponible
      ORDER BY m.numero
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting table status:', error);
    res.status(500).json({ message: 'Error retrieving table status', error: error.message });
  }
});

// Liberar mesa (marcar órdenes como entregadas)
router.post('/:numero/liberar', optionalAuth, [
  body('metodo_pago').isIn(['efectivo', 'tarjeta', 'transferencia']).withMessage('Invalid payment method')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { numero } = req.params;
    const { metodo_pago } = req.body;
    const mesaNombre = `Mesa ${numero}`;
    
    // Obtener órdenes activas de la mesa
    const activeOrders = await pool.query(
      'SELECT * FROM ordenes WHERE mesa = $1 AND estado IN (\'pendiente\', \'confirmada\', \'preparando\', \'lista\')',
      [mesaNombre]
    );
    
    if (activeOrders.rows.length === 0) {
      return res.status(404).json({ message: 'No active orders found for this table' });
    }
    
    // Actualizar órdenes a entregada
    const result = await pool.query(
      'UPDATE ordenes SET estado = \'entregada\', metodo_pago = $2, fecha_modificacion = CURRENT_TIMESTAMP WHERE mesa = $1 AND estado IN (\'pendiente\', \'confirmada\', \'preparando\', \'lista\') RETURNING *',
      [mesaNombre, metodo_pago]
    );
    
    const totalCuenta = result.rows.reduce((sum, order) => sum + parseFloat(order.total), 0);
    
    res.json({
      message: 'Table cleared successfully',
      orders: result.rows,
      total_cuenta: totalCuenta,
      metodo_pago
    });
  } catch (error) {
    console.error('Error clearing table:', error);
    res.status(500).json({ message: 'Error clearing table', error: error.message });
  }
});

module.exports = router;
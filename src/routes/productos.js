const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Crear un producto
router.post('/', async (req, res) => {
  try {
    const {
      nombre,
      precio,
      categoria_id,
      descripcion,
      disponible,
      imagen_url,
      tiempo_preparacio,
      ingredientes,
      alergenos,
      calorias
    } = req.body;

    const result = await pool.query(`
      INSERT INTO productos 
        (nombre, precio, categoria_id, descripcion, disponible, imagen_url, tiempo_preparacio, ingredientes, alergenos, calorias, created_at, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [nombre, precio, categoria_id, descripcion, disponible, imagen_url, tiempo_preparacio, ingredientes, alergenos, calorias]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      precio,
      categoria_id,
      descripcion,
      disponible,
      imagen_url,
      tiempo_preparacio,
      ingredientes,
      alergenos,
      calorias
    } = req.body;

    const result = await pool.query(`
      UPDATE productos SET
        nombre = $1,
        precio = $2,
        categoria_id = $3,
        descripcion = $4,
        disponible = $5,
        imagen_url = $6,
        tiempo_preparacio = $7,
        ingredientes = $8,
        alergenos = $9,
        calorias = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *`,
      [nombre, precio, categoria_id, descripcion, disponible, imagen_url, tiempo_preparacio, ingredientes, alergenos, calorias, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// Eliminar producto
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM productos WHERE id = $1', [id]);
    res.sendStatus(204);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;

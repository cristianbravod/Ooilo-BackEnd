// backend/src/routes/menu.js
const express = require('express');
const { body } = require('express-validator');
const MenuController = require('../controllers/MenuController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Validaciones
const validateMenuItem = [
  body('nombre').notEmpty().withMessage('Name is required'),
  body('precio').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('categoria_id').isInt().withMessage('Category ID must be an integer'),
  body('descripcion').optional().isString()
];

const validateCategory = [
  body('nombre').notEmpty().withMessage('Category name is required'),
  body('descripcion').optional().isString()
];

// Rutas públicas (no requieren autenticación)
router.get('/categorias', MenuController.getCategories);
router.get('/menu', MenuController.getMenu);
router.get('/menu/:id', MenuController.getMenuItem);
router.get('/especiales', MenuController.getSpecialItems);
router.get('/search', MenuController.getMenu); // Reutilizar con query params

// Rutas que requieren autenticación de admin
router.post('/categorias', authMiddleware, adminMiddleware, validateCategory, MenuController.createCategory);
router.post('/menu', authMiddleware, adminMiddleware, validateMenuItem, MenuController.createMenuItem);
router.put('/menu/:id', authMiddleware, adminMiddleware, validateMenuItem, MenuController.updateMenuItem);
router.delete('/menu/:id', authMiddleware, adminMiddleware, MenuController.deleteMenuItem);
router.patch('/menu/:id/disponibilidad', authMiddleware, adminMiddleware, MenuController.toggleAvailability);

// Rutas para platos especiales
router.post('/especiales', authMiddleware, adminMiddleware, [
  body('nombre').notEmpty().withMessage('Name is required'),
  body('precio').isFloat({ min: 0 }).withMessage('Price must be a positive number')
], MenuController.createSpecialItem);

module.exports = router;
// backend/src/routes/orders.js
const express = require('express');
const { body } = require('express-validator');
const OrderController = require('../controllers/OrderController');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Validaciones
const validateOrder = [
  body('mesa').notEmpty().withMessage('Table is required'),
  body('items').isArray({ min: 1 }).withMessage('Items array is required and must not be empty'),
  body('items.*.menu_item_id').isInt().withMessage('Menu item ID must be an integer'),
  body('items.*.cantidad').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('metodo_pago').isIn(['efectivo', 'tarjeta', 'transferencia']).withMessage('Invalid payment method')
];

const validateOrderStatus = [
  body('estado').isIn(['pendiente', 'confirmada', 'preparando', 'lista', 'entregada', 'cancelada'])
    .withMessage('Invalid order status')
];

const validateQuickOrder = [
  body('mesa').notEmpty().withMessage('Table is required'),
  body('items').isArray({ min: 1 }).withMessage('Items array is required and must not be empty'),
  body('items.*.menu_item_id').isInt().withMessage('Menu item ID must be an integer'),
  body('items.*.cantidad').isInt({ min: 1 }).withMessage('Quantity must be a positive integer')
];

// Rutas públicas (para uso en restaurant sin autenticación estricta)
router.post('/quick', validateQuickOrder, OrderController.createQuickOrder);
router.get('/mesa/:mesa', OrderController.getOrdersByTable);
router.post('/mesa/:mesa/cerrar', [
  body('metodo_pago').isIn(['efectivo', 'tarjeta', 'transferencia']).withMessage('Invalid payment method')
], OrderController.closeTable);

// Rutas que requieren autenticación
router.post('/', authMiddleware, validateOrder, OrderController.createOrder);
router.get('/mis-ordenes', authMiddleware, OrderController.getMyOrders);
router.get('/:id', authMiddleware, OrderController.getOrderById);
router.patch('/:id/cancelar', authMiddleware, OrderController.cancelOrder);

// Rutas para personal del restaurante (admin, cocinero, mesero)
router.get('/', authMiddleware, adminMiddleware, OrderController.getAllOrders);
router.get('/activas/cocina', authMiddleware, OrderController.getActiveOrders);
router.patch('/:id/estado', authMiddleware, validateOrderStatus, OrderController.updateOrderStatus);
router.get('/estadisticas/resumen', authMiddleware, adminMiddleware, OrderController.getOrderStats);

module.exports = router;
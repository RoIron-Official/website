/**
 * Order Routes
 * Handles order creation, management, and tracking
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import { getPrisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { 
  NotFoundError,
  ValidationError,
  AuthorizationError
} from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = errors.array().map(err => err.msg);
    throw new ValidationError('Validation failed', errorMessages);
  };
};

/**
 * POST /orders
 * Create new order
 */
router.post('/',
  authenticate,
  validate([
    body('items')
      .isArray({ min: 1 })
      .withMessage('Order must contain at least one item'),
    body('items.*.productId')
      .notEmpty()
      .withMessage('Product ID is required'),
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    body('shippingAddress')
      .isObject()
      .withMessage('Shipping address is required'),
    body('shippingAddress.street')
      .notEmpty()
      .withMessage('Street address is required'),
    body('shippingAddress.city')
      .notEmpty()
      .withMessage('City is required'),
    body('shippingAddress.postalCode')
      .notEmpty()
      .withMessage('Postal code is required'),
    body('shippingAddress.country')
      .notEmpty()
      .withMessage('Country is required'),
    body('paymentMethod')
      .isIn(['credit_card', 'paypal', 'stripe'])
      .withMessage('Invalid payment method')
  ]),
  async (req, res, next) => {
    try {
      const { items, shippingAddress, paymentMethod } = req.body;
      const prisma = getPrisma();

      // Validate product availability and calculate total
      let total = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          throw new ValidationError(`Product ${item.productId} not found`);
        }

        if (!product.isActive) {
          throw new ValidationError(`Product ${product.name} is not available`);
        }

        if (product.stock < item.quantity) {
          throw new ValidationError(`Insufficient stock for ${product.name}`);
        }

        const itemTotal = product.price * item.quantity;
        total += itemTotal;

        orderItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.price,
          name: product.name
        });
      }

      // Create order
      const order = await prisma.order.create({
        data: {
          userId: req.user.id,
          items: orderItems,
          total,
          shippingAddress,
          paymentMethod,
          status: 'PENDING',
          paymentStatus: 'PENDING'
        }
      });

      // Update product stock
      for (const item of items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
      }

      logger.info(`Order created: ${order.id}`, { 
        orderId: order.id,
        userId: req.user.id,
        total 
      });

      res.status(201).json({
        success: true,
        data: { order },
        message: 'Order created successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /orders
 * List user orders
 */
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const prisma = getPrisma();

      const skip = (page - 1) * limit;
      const take = parseInt(limit, 10);

      const where = { userId: req.user.id };
      if (status) {
        where.status = status;
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          select: {
            id: true,
            total: true,
            status: true,
            paymentStatus: true,
            items: true,
            shippingAddress: true,
            createdAt: true,
            updatedAt: true
          },
          skip,
          take,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: parseInt(page, 10),
            limit: take,
            total,
            pages: Math.ceil(total / take)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /orders/:id
 * Get order details
 */
router.get('/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const prisma = getPrisma();

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!order) {
        throw new NotFoundError('Order');
      }

      // Check authorization
      if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('You are not authorized to view this order');
      }

      res.json({
        success: true,
        data: { order }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /orders/:id/status
 * Update order status (Admin only)
 */
router.put('/:id/status',
  authenticate,
  authorize('ADMIN'),
  validate([
    body('status')
      .isIn(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
      .withMessage('Invalid order status')
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const prisma = getPrisma();

      const order = await prisma.order.update({
        where: { id },
        data: { 
          status,
          updatedAt: new Date()
        }
      });

      logger.info(`Order status updated: ${id} -> ${status}`, { 
        orderId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: { order },
        message: 'Order status updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /orders/:id/cancel
 * Cancel order (User or Admin)
 */
router.put('/:id/cancel',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const prisma = getPrisma();

      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw new NotFoundError('Order');
      }

      // Check authorization
      if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('You are not authorized to cancel this order');
      }

      // Check if order can be cancelled
      if (order.status === 'DELIVERED') {
        throw new ValidationError('Delivered orders cannot be cancelled');
      }

      if (order.status === 'CANCELLED') {
        throw new ValidationError('Order is already cancelled');
      }

      // Restore product stock
      for (const item of order.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status: 'CANCELLED',
          updatedAt: new Date()
        }
      });

      logger.info(`Order cancelled: ${id}`, { 
        orderId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: { order: updatedOrder },
        message: 'Order cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

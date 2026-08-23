/**
 * Payment Routes
 * Handles payment processing and webhooks
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import { getPrisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { 
  NotFoundError,
  ValidationError,
  AuthenticationError
} from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

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
 * POST /payments/create-intent
 * Create payment intent (Stripe, PayPal, etc.)
 */
router.post('/create-intent',
  authenticate,
  validate([
    body('orderId')
      .notEmpty()
      .withMessage('Order ID is required'),
    body('paymentMethod')
      .isIn(['credit_card', 'paypal'])
      .withMessage('Invalid payment method')
  ]),
  async (req, res, next) => {
    try {
      const { orderId, paymentMethod } = req.body;
      const prisma = getPrisma();

      // Get order
      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw new NotFoundError('Order');
      }

      if (order.userId !== req.user.id) {
        throw new AuthenticationError('You are not authorized to pay for this order');
      }

      if (order.status === 'CANCELLED') {
        throw new ValidationError('Cancelled orders cannot be paid');
      }

      if (order.paymentStatus === 'PAID') {
        throw new ValidationError('Order is already paid');
      }

      // In production, integrate with Stripe/PayPal
      // This is a placeholder implementation
      const paymentIntent = {
        id: `pi_${Date.now()}`,
        amount: order.total,
        currency: 'USD',
        status: 'requires_payment_method',
        clientSecret: `pi_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`
      };

      logger.info(`Payment intent created for order: ${orderId}`, { 
        orderId,
        userId: req.user.id,
        amount: order.total
      });

      res.json({
        success: true,
        data: {
          paymentIntent,
          orderId: order.id,
          amount: order.total,
          currency: 'USD'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /payments/confirm
 * Confirm payment
 */
router.post('/confirm',
  authenticate,
  validate([
    body('orderId')
      .notEmpty()
      .withMessage('Order ID is required'),
    body('paymentIntentId')
      .notEmpty()
      .withMessage('Payment Intent ID is required')
  ]),
  async (req, res, next) => {
    try {
      const { orderId, paymentIntentId } = req.body;
      const prisma = getPrisma();

      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw new NotFoundError('Order');
      }

      if (order.userId !== req.user.id) {
        throw new AuthenticationError('You are not authorized to pay for this order');
      }

      // In production, verify payment with Stripe/PayPal
      // This is a placeholder

      // Update order payment status
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          status: 'PROCESSING',
          updatedAt: new Date()
        }
      });

      logger.info(`Payment confirmed for order: ${orderId}`, { 
        orderId,
        userId: req.user.id,
        paymentIntentId
      });

      res.json({
        success: true,
        data: { 
          order: updatedOrder,
          paymentStatus: 'PAID'
        },
        message: 'Payment confirmed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /payments/history
 * Get user payment history
 */
router.get('/history',
  authenticate,
  async (req, res, next) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const prisma = getPrisma();

      const skip = (page - 1) * limit;
      const take = parseInt(limit, 10);

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { 
            userId: req.user.id,
            paymentStatus: 'PAID'
          },
          select: {
            id: true,
            total: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            items: true,
            createdAt: true,
            updatedAt: true
          },
          skip,
          take,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({
          where: { 
            userId: req.user.id,
            paymentStatus: 'PAID'
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          payments: orders,
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

export default router;

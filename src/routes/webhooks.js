/**
 * Webhook Routes
 * Handles incoming webhooks from external services
 */

import express from 'express';
import { config } from '../../config/config.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /webhooks/stripe
 * Handle Stripe webhooks
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      
      // In production, verify webhook signature
      // const event = stripe.webhooks.constructEvent(
      //   req.body,
      //   signature,
      //   config.payment.stripeWebhookSecret
      // );

      // Placeholder - just log the webhook
      logger.info('Stripe webhook received', { 
        type: req.body.type,
        data: req.body.data
      });

      // Handle different event types
      switch (req.body.type) {
        case 'payment_intent.succeeded':
          // Handle successful payment
          logger.info('Payment succeeded', { 
            paymentIntentId: req.body.data.object.id 
          });
          break;
        case 'payment_intent.payment_failed':
          // Handle failed payment
          logger.warn('Payment failed', { 
            paymentIntentId: req.body.data.object.id 
          });
          break;
        default:
          logger.debug(`Unhandled webhook event: ${req.body.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      res.status(400).json({ error: 'Webhook error' });
    }
  }
);

/**
 * POST /webhooks/paypal
 * Handle PayPal webhooks
 */
router.post('/paypal',
  express.json(),
  async (req, res) => {
    try {
      // In production, verify PayPal webhook signature
      logger.info('PayPal webhook received', { 
        event_type: req.body.event_type,
        resource: req.body.resource
      });

      // Handle different event types
      switch (req.body.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          logger.info('PayPal payment completed', { 
            paymentId: req.body.resource.id 
          });
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          logger.warn('PayPal payment denied', { 
            paymentId: req.body.resource.id 
          });
          break;
        default:
          logger.debug(`Unhandled PayPal webhook event: ${req.body.event_type}`);
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('PayPal webhook error:', error);
      res.status(400).json({ error: 'Webhook error' });
    }
  }
);

export default router;

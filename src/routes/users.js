/**
 * User Management Routes
 * Handles user profile management and admin operations
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { 
  AuthenticationError, 
  AuthorizationError,
  NotFoundError,
  ValidationError
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
 * GET /users/me
 * Get current user profile
 */
router.get('/me', 
  authenticate,
  async (req, res, next) => {
    try {
      const prisma = getPrisma();
      
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /users/me
 * Update current user profile
 */
router.put('/me',
  authenticate,
  validate([
    body('firstName')
      .optional()
      .isLength({ min: 2 })
      .withMessage('First name must be at least 2 characters')
      .trim(),
    body('lastName')
      .optional()
      .isLength({ min: 2 })
      .withMessage('Last name must be at least 2 characters')
      .trim(),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail()
  ]),
  async (req, res, next) => {
    try {
      const { firstName, lastName, email } = req.body;
      const prisma = getPrisma();

      // Check if email is being changed and if it's already taken
      if (email && email !== req.user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email }
        });

        if (existingUser) {
          throw new ValidationError('Email already taken');
        }
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true
        }
      });

      logger.info(`User profile updated: ${user.email}`, { userId: user.id });

      res.json({
        success: true,
        data: { user },
        message: 'Profile updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /users/me/password
 * Change user password
 */
router.put('/me/password',
  authenticate,
  validate([
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number')
  ]),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const prisma = getPrisma();

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password
      const salt = await bcrypt.genSalt(config.security.bcryptSaltRounds);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password
      await prisma.user.update({
        where: { id: req.user.id },
        data: { 
          password: hashedPassword,
          updatedAt: new Date()
        }
      });

      logger.info(`Password changed for user: ${user.email}`, { userId: user.id });

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /users/me
 * Delete user account
 */
router.delete('/me',
  authenticate,
  validate([
    body('password')
      .notEmpty()
      .withMessage('Password is required to delete account')
  ]),
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const prisma = getPrisma();

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid password');
      }

      // Delete user (soft delete could be implemented here)
      await prisma.user.delete({
        where: { id: req.user.id }
      });

      logger.info(`User account deleted: ${user.email}`, { userId: user.id });

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /users
 * List all users (Admin only)
 */
router.get('/',
  authenticate,
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const { page = 1, limit = 10, search } = req.query;
      const prisma = getPrisma();

      const skip = (page - 1) * limit;
      const take = parseInt(limit, 10);

      // Build where clause
      const where = {};
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isEmailVerified: true,
            createdAt: true,
            updatedAt: true
          },
          skip,
          take,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          users,
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
 * GET /users/:id
 * Get user by ID (Admin only)
 */
router.get('/:id',
  authenticate,
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const prisma = getPrisma();

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /users/:id/role
 * Update user role (Admin only)
 */
router.put('/:id/role',
  authenticate,
  authorize('ADMIN'),
  validate([
    body('role')
      .isIn(['USER', 'ADMIN', 'MANAGER'])
      .withMessage('Invalid role')
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const prisma = getPrisma();

      const user = await prisma.user.update({
        where: { id },
        data: { 
          role,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true
        }
      });

      logger.info(`User role updated: ${user.email}`, { 
        userId: user.id, 
        newRole: role 
      });

      res.json({
        success: true,
        data: { user },
        message: 'User role updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

/**
 * Authentication Routes
 * Handles user registration, login, logout, and token management
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config/config.js';
import { getPrisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { 
  AuthenticationError, 
  ValidationError,
  RateLimitError
} from '../middleware/errorHandler.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// Rate limiter for auth routes
const authLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  }
});

/**
 * Validation middleware
 */
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
 * Generate JWT tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      role: user.role 
    },
    config.jwt.accessSecret,
    { 
      expiresIn: config.jwt.accessExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    config.jwt.refreshSecret,
    { 
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    }
  );

  return { accessToken, refreshToken };
};

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register',
  authLimiter,
  validate([
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number'),
    body('firstName')
      .optional()
      .isLength({ min: 2 })
      .withMessage('First name must be at least 2 characters')
      .trim(),
    body('lastName')
      .optional()
      .isLength({ min: 2 })
      .withMessage('Last name must be at least 2 characters')
      .trim()
  ]),
  async (req, res, next) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      const prisma = getPrisma();

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(config.security.bcryptSaltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: 'USER',
          isEmailVerified: false
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true
        }
      });

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);

      logger.info(`User registered: ${user.email}`, { userId: user.id });

      res.status(201).json({
        success: true,
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: config.jwt.accessExpiresIn
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/login
 * Login user
 */
router.post('/login',
  authLimiter,
  validate([
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ]),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const prisma = getPrisma();

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        // Log failed attempt
        logger.warn(`Failed login attempt for ${email}`, { 
          email, 
          ip: req.ip 
        });
        throw new AuthenticationError('Invalid email or password');
      }

      // Check if email is verified (if feature enabled)
      if (config.features.emailVerification && !user.isEmailVerified) {
        throw new AuthenticationError('Please verify your email before logging in');
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);

      // Remove password from user object
      const { password: _, ...userWithoutPassword } = user;

      // Log successful login
      logger.info(`User logged in: ${user.email}`, { userId: user.id });

      res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: config.jwt.accessExpiresIn
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh',
  validate([
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ]),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      });

      const prisma = getPrisma();

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      });

      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

      logger.info(`Tokens refreshed for user: ${user.email}`, { userId: user.id });

      res.json({
        success: true,
        data: {
          tokens: {
            accessToken,
            refreshToken: newRefreshToken,
            expiresIn: config.jwt.accessExpiresIn
          }
        }
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        next(new AuthenticationError('Invalid or expired refresh token'));
      } else {
        next(error);
      }
    }
  }
);

/**
 * POST /auth/logout
 * Logout user (client-side token discard)
 */
router.post('/logout',
  async (req, res, next) => {
    try {
      // Invalidate session if using sessions
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destruction error:', err);
          }
        });
      }

      // Clear cookie if exists
      res.clearCookie('token');

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/verify-email
 * Verify email address
 */
router.post('/verify-email',
  validate([
    body('token')
      .notEmpty()
      .withMessage('Verification token is required')
  ]),
  async (req, res, next) => {
    try {
      const { token } = req.body;

      // In production, this would verify a JWT or UUID token
      // For simplicity, we're just marking as verified
      const prisma = getPrisma();

      // In a real implementation, you would decode the token and find the user
      // This is a placeholder
      const user = await prisma.user.update({
        where: { email: 'user@example.com' }, // This would be dynamic
        data: { isEmailVerified: true }
      });

      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password',
  validate([
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail()
  ]),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const prisma = getPrisma();

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        // Don't reveal if user exists or not
        return res.json({
          success: true,
          message: 'If an account exists with this email, you will receive a password reset link'
        });
      }

      // In production, send email with reset token
      // For now, just log
      logger.info(`Password reset requested for: ${email}`, { userId: user.id });

      res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/reset-password
 * Reset password with token
 */
router.post('/reset-password',
  validate([
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),
    body('password')
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
      const { token, password } = req.body;

      // In production, verify token and update password
      // This is a placeholder
      const salt = await bcrypt.genSalt(config.security.bcryptSaltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Update user password
      // const prisma = getPrisma();
      // await prisma.user.update({
      //   where: { id: userId },
      //   data: { password: hashedPassword }
      // });

      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

/**
 * Authentication Middleware
 * JWT verification and authorization
 */

import jwt from 'jsonwebtoken';
import { config } from '../../config/config.js';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';
import { logger } from '../utils/logger.js';
import { getPrisma } from '../database/connection.js';

/**
 * Authenticate JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AuthenticationError('Invalid token format');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });

    // Get user from database
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true
      }
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    req.tokenDecoded = decoded;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new AuthenticationError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Authorize user roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Middleware function
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      if (!roles.includes(req.user.role)) {
        throw new AuthorizationError(
          `Role ${req.user.role} is not authorized for this action. Required roles: ${roles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user owns the resource
 * @param {Function} getResourceUserId - Function to get resource owner ID
 * @returns {Function} Middleware function
 */
export const checkOwnership = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Admin can access any resource
      if (req.user.role === 'ADMIN') {
        return next();
      }

      const resourceUserId = await getResourceUserId(req);
      
      if (resourceUserId !== req.user.id) {
        throw new AuthorizationError('You do not have permission to access this resource');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

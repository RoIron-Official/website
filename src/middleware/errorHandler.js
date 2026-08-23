/**
 * Global Error Handler Middleware
 * Centralized error handling and logging
 */

import { config } from '../../config/config.js';
import { logger } from '../utils/logger.js';

// Custom error classes
export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

/**
 * Error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const errorHandler = (err, req, res, next) => {
  // Default error
  let error = err;
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AuthenticationError('Invalid token');
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid or expired token';
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith('P')) {
    statusCode = 400;
    errorCode = 'DATABASE_ERROR';
    
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        errorCode = 'DUPLICATE_ENTRY';
        message = 'A record with this value already exists';
        details = err.meta?.target || null;
        break;
      case 'P2025':
        statusCode = 404;
        errorCode = 'RECORD_NOT_FOUND';
        message = 'Record not found';
        break;
      case 'P2011':
        statusCode = 400;
        errorCode = 'MISSING_FIELD';
        message = 'Required field is missing';
        details = err.meta?.constraint || null;
        break;
      default:
        message = err.message || 'Database operation failed';
    }
  }

  // Handle validation errors (Joi, express-validator)
  if (err.name === 'ValidationError' || err.isJoi) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.message || 'Validation failed';
    details = err.details || null;
  }

  // Log error
  if (statusCode >= 500) {
    logger.error(message, {
      error: error,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      user: req.user?.id
    });
  } else {
    logger.warn(message, {
      errorCode,
      statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
      user: req.user?.id,
      details
    });
  }

  // Send response
  const response = {
    error: errorCode,
    message: message,
    statusCode: statusCode,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  };

  // Include details in development
  if (config.server.isDevelopment && details) {
    response.details = details;
  }

  // Include stack trace in development
  if (config.server.isDevelopment && error.stack) {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export default errorHandler;

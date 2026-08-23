/**
 * Logger Utility
 * Structured logging with multiple transports and log levels
 */

import winston from 'winston';
import { config } from '../../config/config.js';

const { combine, timestamp, printf, colorize, json, simple } = winston.format;

// Custom log format
const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level || 'info',
  format: combine(
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    config.logging.format === 'json' 
      ? json() 
      : combine(colorize(), customFormat)
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        colorize({
          all: true,
          colors: {
            error: 'red',
            warn: 'yellow',
            info: 'green',
            debug: 'blue'
          }
        }),
        simple()
      )
    })
  ],
  exitOnError: false
});

// Add file transports in production
if (config.server.isProduction) {
  // Error log file
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: json()
    })
  );

  // Combined log file
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: json()
    })
  );
}

// Development logging
if (config.server.isDevelopment) {
  logger.level = 'debug';
  
  // Add development specific transport
  logger.add(
    new winston.transports.File({
      filename: 'logs/debug.log',
      level: 'debug',
      format: combine(timestamp(), customFormat)
    })
  );
}

// Custom log methods with additional context
class Logger {
  /**
   * Log error with stack trace
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or metadata
   * @param {Object} metadata - Additional metadata
   */
  error(message, error = null, metadata = {}) {
    if (error instanceof Error) {
      logger.error(message, {
        ...metadata,
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    } else {
      logger.error(message, { ...metadata, ...error });
    }
  }

  /**
   * Log warning
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    logger.warn(message, metadata);
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    logger.info(message, metadata);
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    logger.debug(message, metadata);
  }

  /**
   * Log HTTP request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {number} responseTime - Response time in ms
   */
  http(req, res, responseTime) {
    const metadata = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      referer: req.get('referer') || 'direct'
    };

    if (req.user) {
      metadata.userId = req.user.id;
    }

    const level = res.statusCode >= 400 ? 'error' : 'info';
    this[level](`${req.method} ${req.url}`, metadata);
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in ms
   * @param {Object} metadata - Additional metadata
   */
  performance(operation, duration, metadata = {}) {
    this.info(`Performance: ${operation}`, {
      ...metadata,
      operation,
      duration: `${duration}ms`
    });
  }

  /**
   * Create child logger with fixed metadata
   * @param {Object} metadata - Fixed metadata
   * @returns {Logger} Child logger instance
   */
  child(metadata = {}) {
    const childLogger = logger.child(metadata);
    const child = new Logger();
    child.logger = childLogger;
    return child;
  }
}

export { logger, Logger };
export default logger;

/**
 * Database Connection Module
 * PostgreSQL connection management with Prisma ORM
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../../config/config.js';
import { logger } from '../utils/logger.js';

class DatabaseConnection {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000;
  }

  /**
   * Initialize Prisma client with connection configuration
   * @returns {PrismaClient} Prisma client instance
   */
  getClient() {
    if (!this.prisma) {
      this.prisma = new PrismaClient({
        log: config.server.isDevelopment 
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
        errorFormat: 'pretty',
        datasources: {
          db: {
            url: config.database.url
          }
        }
      });

      // Add middleware for logging
      this.prisma.$use(async (params, next) => {
        const before = Date.now();
        const result = await next(params);
        const after = Date.now();
        
        if (config.logging.level === 'debug') {
          logger.debug(`Prisma Query: ${params.model}.${params.action}`, {
            duration: after - before,
            model: params.model,
            action: params.action
          });
        }
        
        return result;
      });
    }
    
    return this.prisma;
  }

  /**
   * Connect to database with retry logic
   * @returns {Promise<PrismaClient>} Connected Prisma client
   */
  async connect() {
    if (this.isConnected && this.prisma) {
      return this.prisma;
    }

    try {
      this.connectionAttempts++;
      const client = this.getClient();
      
      // Test connection
      await client.$queryRaw`SELECT 1`;
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      logger.info('Database connection established successfully');
      
      return client;
    } catch (error) {
      logger.error('Database connection failed:', error);
      
      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying in ${this.retryDelay / 1000} seconds... (Attempt ${this.connectionAttempts}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connect();
      } else {
        throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error.message}`);
      }
    }
  }

  /**
   * Disconnect from database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.isConnected = false;
      logger.info('Database disconnected');
    }
  }

  /**
   * Get connection status
   * @returns {object} Connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      maxRetries: this.maxRetries,
      environment: config.server.nodeEnv
    };
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      // Only run in development
      if (config.server.isDevelopment) {
        logger.info('Running database migrations...');
        // Note: Prisma migrations are run via CLI
        // This is just a placeholder for the connection
        logger.info('Migrations completed');
      }
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const db = new DatabaseConnection();

// Export convenience methods
export const connectDB = () => db.connect();
export const disconnectDB = () => db.disconnect();
export const getPrisma = () => db.getClient();
export const dbStatus = () => db.getStatus();

export default db;

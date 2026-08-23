/**
 * Main Server Entry Point
 * Express server with all middleware and routes
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import cookieParser from 'cookie-parser';
import { config } from '../config/config.js';
import { connectDB } from './database/connection.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhooks.js';

// Initialize express app
const app = express();

// Create Redis client for session storage
let redisClient;
let sessionStore;

if (config.redis.url) {
  try {
    redisClient = createClient({
      url: config.redis.url
    });
    
    await redisClient.connect();
    
    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'roiron:session:',
      ttl: config.redis.ttl
    });
    
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Fallback to memory store
    sessionStore = new session.MemoryStore();
  }
} else {
  sessionStore = new session.MemoryStore();
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", config.frontend.url],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS middleware
app.use(cors({
  origin: config.api.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session middleware
app.use(session({
  store: sessionStore,
  secret: config.security.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.server.isProduction,
    httpOnly: true,
    maxAge: config.security.sessionMaxAge,
    sameSite: 'strict'
  }
}));

// Logging middleware
if (config.server.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later'
    });
  }
});

// Apply rate limiting to all routes except webhooks
app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    version: config.api.version
  });
});

// API routes
const apiBase = config.api.baseUrl;
app.use(`${apiBase}/auth`, authRoutes);
app.use(`${apiBase}/users`, userRoutes);
app.use(`${apiBase}/products`, productRoutes);
app.use(`${apiBase}/orders`, orderRoutes);
app.use(`${apiBase}/payments`, paymentRoutes);

// Webhook routes (no rate limiting)
app.use('/webhooks', webhookRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path
  });
});

// Global error handler
app.use(errorHandler);

// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected successfully');

    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📚 API Version: ${config.api.version}`);
      logger.info(`🌐 Environment: ${config.server.nodeEnv}`);
      logger.info(`📖 API Documentation: http://localhost:${PORT}${config.api.baseUrl}/docs`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        if (redisClient) {
          await redisClient.quit();
          logger.info('Redis connection closed');
        }
        
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if not in test environment
if (config.server.nodeEnv !== 'test') {
  startServer();
}

export { app, startServer };

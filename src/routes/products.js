/**
 * Product Routes
 * Handles product CRUD operations and management
 */

import express from 'express';
import { body, validationResult, query } from 'express-validator';
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
 * GET /products
 * List all products with filtering and pagination
 */
router.get('/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('category').optional().isString().trim(),
    query('minPrice').optional().isFloat({ min: 0 }).toFloat(),
    query('maxPrice').optional().isFloat({ min: 0 }).toFloat(),
    query('search').optional().isString().trim(),
    query('sortBy').optional().isIn(['price', 'name', 'createdAt', 'rating']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ]),
  async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        minPrice,
        maxPrice,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const prisma = getPrisma();
      const skip = (page - 1) * limit;
      const take = parseInt(limit, 10);

      // Build where clause
      const where = { isActive: true };

      if (category) {
        where.category = category;
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {};
        if (minPrice !== undefined) {
          where.price.gte = minPrice;
        }
        if (maxPrice !== undefined) {
          where.price.lte = maxPrice;
        }
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Build order by
      const orderBy = {};
      orderBy[sortBy] = sortOrder;

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            category: true,
            images: true,
            stock: true,
            rating: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          },
          skip,
          take,
          orderBy
        }),
        prisma.product.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          products,
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
 * GET /products/:id
 * Get product by ID
 */
router.get('/:id',
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const prisma = getPrisma();

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          category: true,
          images: true,
          stock: true,
          rating: true,
          reviews: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!product) {
        throw new NotFoundError('Product');
      }

      res.json({
        success: true,
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /products
 * Create new product (Admin only)
 */
router.post('/',
  authenticate,
  authorize('ADMIN'),
  validate([
    body('name')
      .isLength({ min: 3 })
      .withMessage('Product name must be at least 3 characters')
      .trim(),
    body('description')
      .isLength({ min: 10 })
      .withMessage('Description must be at least 10 characters')
      .trim(),
    body('price')
      .isFloat({ min: 0.01 })
      .withMessage('Price must be greater than 0')
      .toFloat(),
    body('category')
      .isString()
      .withMessage('Category is required')
      .trim(),
    body('stock')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer')
      .toInt(),
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array'),
    body('images.*')
      .optional()
      .isURL()
      .withMessage('Each image must be a valid URL')
  ]),
  async (req, res, next) => {
    try {
      const { 
        name, 
        description, 
        price, 
        category, 
        stock = 0, 
        images = [],
        rating = 0 
      } = req.body;

      const prisma = getPrisma();

      const product = await prisma.product.create({
        data: {
          name,
          description,
          price,
          category,
          stock,
          images,
          rating,
          isActive: true
        }
      });

      logger.info(`Product created: ${product.name}`, { 
        productId: product.id,
        userId: req.user.id 
      });

      res.status(201).json({
        success: true,
        data: { product },
        message: 'Product created successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /products/:id
 * Update product (Admin only)
 */
router.put('/:id',
  authenticate,
  authorize('ADMIN'),
  validate([
    body('name')
      .optional()
      .isLength({ min: 3 })
      .withMessage('Product name must be at least 3 characters')
      .trim(),
    body('description')
      .optional()
      .isLength({ min: 10 })
      .withMessage('Description must be at least 10 characters')
      .trim(),
    body('price')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Price must be greater than 0')
      .toFloat(),
    body('stock')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer')
      .toInt(),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
      .toBoolean()
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, description, price, stock, isActive } = req.body;

      const prisma = getPrisma();

      // Check if product exists
      const existingProduct = await prisma.product.findUnique({
        where: { id }
      });

      if (!existingProduct) {
        throw new NotFoundError('Product');
      }

      const product = await prisma.product.update({
        where: { id },
        data: {
          name: name || undefined,
          description: description || undefined,
          price: price || undefined,
          stock: stock !== undefined ? stock : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
          updatedAt: new Date()
        }
      });

      logger.info(`Product updated: ${product.name}`, { 
        productId: product.id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: { product },
        message: 'Product updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /products/:id
 * Delete product (Admin only)
 */
router.delete('/:id',
  authenticate,
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const prisma = getPrisma();

      // Check if product exists
      const existingProduct = await prisma.product.findUnique({
        where: { id }
      });

      if (!existingProduct) {
        throw new NotFoundError('Product');
      }

      // Soft delete - mark as inactive
      await prisma.product.update({
        where: { id },
        data: { 
          isActive: false,
          updatedAt: new Date()
        }
      });

      logger.info(`Product deleted (soft): ${existingProduct.name}`, { 
        productId: id,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

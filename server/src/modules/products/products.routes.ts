import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './products.controller';
import { categorySchema, createProductSchema, updateProductSchema } from './products.schema';

const owner = requireRole('OWNER');

// Everyone logged in can look products up (the counter needs prices).
// Only the owner can create or change them.
export const productsRouter = Router();
productsRouter.use(auth);
productsRouter.get('/', c.list);
productsRouter.get('/barcode/:code', c.byBarcode); // before '/:id', or "barcode" would be read as an id
productsRouter.get('/:id', c.get);
productsRouter.post('/', owner, validate(createProductSchema), c.create);
productsRouter.patch('/:id', owner, validate(updateProductSchema), c.update);

export const categoriesRouter = Router();
categoriesRouter.use(auth);
categoriesRouter.get('/', c.listCategories);
categoriesRouter.post('/', owner, validate(categorySchema), c.createCategory);

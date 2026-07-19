import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  searchFeatures,
  getFeature,
  getFeatureGraph,
  getFeatureDependencies,
  getFeatureFlow,
  explainFeature,
  togglePin,
  toggleFavorite,
  getSearchHistory,
} from '../controllers/features';

const router = Router();

router.get('/search', authenticate, searchFeatures);
router.get('/history', authenticate, getSearchHistory);
router.post('/explain', authenticate, explainFeature);

router.get('/:id', authenticate, getFeature);
router.get('/:id/graph', authenticate, getFeatureGraph);
router.get('/:id/dependencies', authenticate, getFeatureDependencies);
router.get('/:id/flow', authenticate, getFeatureFlow);

router.patch('/:id/pin', authenticate, togglePin);
router.patch('/:id/favorite', authenticate, toggleFavorite);

export default router;
export { router as featuresRouter };

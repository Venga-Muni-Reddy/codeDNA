import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  getFileImpact,
  getImpactGraph,
  getImpactRisk,
  getImpactBusiness,
  simulateChange,
  explainImpact,
} from '../controllers/impact';

const router = Router();

router.get('/file/:id(*)?', authenticate, getFileImpact);
router.get('/graph/:id(*)?', authenticate, getImpactGraph);
router.get('/risk/:id(*)?', authenticate, getImpactRisk);
router.get('/business/:id(*)?', authenticate, getImpactBusiness);
router.post('/simulate', authenticate, simulateChange);
router.post('/explain', authenticate, explainImpact);

export default router;
export { router as impactRouter };

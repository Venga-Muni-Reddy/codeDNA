import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  importGit,
  uploadZip,
  listProjects,
  getProject,
  deleteProject,
  getProjectDependencies,
  getProjectArchitecture,
  getProjectDocumentation,
  explainProjectNode,
  getProjectFileContent,
} from '../controllers/project';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Configure Multer storage directory
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '52428800'), // 50MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') {
      return cb(new Error('Only ZIP files are supported'));
    }
    cb(null, true);
  },
});

// Register routes
router.post('/import-git', authenticate, importGit);
router.post('/upload', authenticate, upload.single('file'), uploadZip);
router.get('/', authenticate, listProjects);
router.get('/:id', authenticate, getProject);
router.get('/:id/dependencies', authenticate, getProjectDependencies);
router.get('/:id/architecture', authenticate, getProjectArchitecture);
router.get('/:id/documentation', authenticate, getProjectDocumentation);
router.get('/:id/file', authenticate, getProjectFileContent);
router.post('/:id/explain', authenticate, explainProjectNode);
router.delete('/:id', authenticate, deleteProject);

export default router;
export { router as projectRouter };

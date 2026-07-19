import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { env } from '../config/env';
import { ImpactAnalyzerService } from '../services/ImpactAnalyzerService';
import { Project } from '../models/Project';
import { FileNode } from '../models/FileNode';
import { generateAccessToken } from '../utils/jwt';

let token: string;
let projectId: string;
let authControllerNodeId: string;
let userModelNodeId: string;
const userId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  // Connect to test database
  const mongoUri = env.MONGO_URI;
  await mongoose.connect(mongoUri, { dbName: 'codeatlas_impact_test' });
  await mongoose.connection.db?.dropDatabase();

  // Generate test user token
  token = generateAccessToken({ userId, role: 'user' });

  // Create project
  const project = await Project.create({
    owner: userId,
    name: 'Impact Test Project',
    sourceType: 'local',
    branch: 'main',
    status: 'completed',
    techStack: ['Node.js'],
  });
  projectId = project._id.toString();

  // Create nested files:
  // src/routes/auth.ts  -> imports -> src/controllers/AuthController.ts
  // src/controllers/AuthController.ts -> imports -> src/models/User.ts
  // src/models/User.ts -> no imports
  const nodes = await FileNode.create([
    {
      project: projectId,
      path: 'src/routes/auth.ts',
      name: 'auth.ts',
      type: 'file',
      size: 150,
      parentPath: 'src/routes',
      classes: [],
      functions: [],
      imports: ['../controllers/AuthController'],
      exports: [],
    },
    {
      project: projectId,
      path: 'src/controllers/AuthController.ts',
      name: 'AuthController.ts',
      type: 'file',
      size: 800,
      parentPath: 'src/controllers',
      classes: [
        {
          name: 'AuthController',
          methods: ['login'],
          startLine: 1,
          endLine: 20,
        }
      ],
      functions: [],
      imports: ['../models/User'],
      exports: ['AuthController'],
    },
    {
      project: projectId,
      path: 'src/models/User.ts',
      name: 'User.ts',
      type: 'file',
      size: 300,
      parentPath: 'src/models',
      classes: [],
      functions: [],
      imports: [],
      exports: ['User'],
    },
  ]);

  authControllerNodeId = nodes[1]._id.toString();
  userModelNodeId = nodes[2]._id.toString();
}, 30000);

afterAll(async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.connection.close();
}, 30000);

describe('ImpactAnalyzerService Unit Tests', () => {
  it('should crawl direct and indirect dependents of a source file correctly', async () => {
    // Analyze User.ts:
    // Direct importer should be AuthController.ts
    // Indirect importer should be auth.ts (AuthController depends on User.ts, auth.ts depends on AuthController)
    const report = await ImpactAnalyzerService.analyzeFile(projectId, userModelNodeId);

    expect(report.directAffected).toContain('src/controllers/AuthController.ts');
    expect(report.indirectAffected).toContain('src/routes/auth.ts');
    expect(report.riskLabel).toBeDefined();
    expect(report.businessFeatures).toContain('User Management');
  });

  it('should calculate simulations for renaming/deleting files', async () => {
    const simulation = await ImpactAnalyzerService.simulateChange(projectId, userModelNodeId, 'delete');
    
    expect(simulation.action).toBe('delete');
    expect(simulation.warningMessage).toContain('User.ts');
    expect(simulation.directAffected).toContain('src/controllers/AuthController.ts');
    expect(simulation.indirectAffected).toContain('src/routes/auth.ts');
  });
});

describe('Impact Analyzer Integration Endpoint Tests', () => {
  describe('GET /api/impact/file/:id', () => {
    it('should fail with 400 if projectId is missing', async () => {
      const res = await request(app)
        .get(`/api/impact/file/${userModelNodeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(400);
    });

    it('should succeed and return the impact profile for a valid file', async () => {
      const res = await request(app)
        .get(`/api/impact/file/${userModelNodeId}?projectId=${projectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.directAffected).toContain('src/controllers/AuthController.ts');
    });
  });

  describe('POST /api/impact/simulate', () => {
    it('should calculate rename consequences cleanly', async () => {
      const res = await request(app)
        .post('/api/impact/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          fileNodeId: userModelNodeId,
          action: 'rename',
          newName: 'Member.ts',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.warningMessage).toContain('Member.ts');
    });
  });
});

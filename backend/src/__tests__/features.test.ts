import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { env } from '../config/env';
import { FeatureSearchService } from '../services/FeatureSearchService';
import { Project } from '../models/Project';
import { FileNode } from '../models/FileNode';
import { User } from '../models/User';
import { generateAccessToken } from '../utils/jwt';

let token: string;
let projectId: string;
const userId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  // Connect to local or remote Atlas test database using same credentials
  await mongoose.connect(env.MONGO_URI, { dbName: 'codeatlas_features_test' });
  await mongoose.connection.db?.dropDatabase();

  // Generate valid test JWT token
  token = generateAccessToken({ userId, role: 'user' });

  // Create test project
  const project = await Project.create({
    owner: userId,
    name: 'Test Project',
    sourceType: 'local',
    branch: 'main',
    status: 'completed',
    techStack: ['Node.js', 'React'],
  });
  projectId = project._id.toString();

  // Create test FileNodes
  await FileNode.create([
    {
      project: projectId,
      path: 'src/routes/auth.ts',
      name: 'auth.ts',
      type: 'file',
      size: 100,
      parentPath: 'src/routes',
      classes: [],
      functions: [],
      imports: ['../controllers/AuthController'],
      exports: ['authRouter'],
    },
    {
      project: projectId,
      path: 'src/controllers/AuthController.ts',
      name: 'AuthController.ts',
      type: 'file',
      size: 500,
      parentPath: 'src/controllers',
      classes: [
        {
          name: 'AuthController',
          methods: ['login', 'register'],
          startLine: 5,
          endLine: 40,
        },
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
}, 30000); // 30s connection timeout for Atlas cluster

afterAll(async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.connection.close();
}, 30000);

describe('FeatureSearchService Unit Tests', () => {
  describe('getSearchTerms', () => {
    it('should expand queries into synonyms correctly', () => {
      const terms = FeatureSearchService.getSearchTerms('auth');
      expect(terms).toContain('auth');
      expect(terms).toContain('authentication');
      expect(terms).toContain('login');
      expect(terms).toContain('jwt');
      expect(terms).toContain('token');
    });

    it('should include split words from camelCase/snake_case/spaced queries', () => {
      const terms = FeatureSearchService.getSearchTerms('stripe_payment');
      expect(terms).toContain('stripe');
      expect(terms).toContain('payment');
    });
  });

  describe('getSuggestions', () => {
    it('should return close matched suggestions if no exact feature is found', () => {
      const suggestions = FeatureSearchService.getSuggestions('authen');
      expect(suggestions).toContain('auth');
      expect(suggestions).toContain('authentication');
    });
  });
});

describe('Feature Finder Endpoint Integration Tests', () => {
  describe('GET /api/features/search', () => {
    it('should fail with 400 if q or projectId is missing', async () => {
      const res = await request(app)
        .get('/api/features/search')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should succeed and return fallback list if no matching files in project for query', async () => {
      const res = await request(app)
        .get(`/api/features/search?projectId=${projectId}&q=billing`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feature).toBeNull();
      expect(res.body.data.suggestions).toBeDefined();
    });

    it('should succeed and return matched feature list + graph for auth query', async () => {
      const res = await request(app)
        .get(`/api/features/search?projectId=${projectId}&q=auth`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feature).toBeDefined();
      expect(res.body.data.feature.confidenceScore).toBeGreaterThan(0);
      expect(res.body.data.feature.graph.nodes.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('GET /api/features/history', () => {
    it('should retrieve search history metrics successfully', async () => {
      const res = await request(app)
        .get(`/api/features/history?projectId=${projectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.history).toContain('auth');
      expect(res.body.data.pinned).toBeDefined();
      expect(res.body.data.favorites).toBeDefined();
    }, 15000);
  });
});

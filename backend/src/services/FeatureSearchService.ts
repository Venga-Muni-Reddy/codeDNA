import path from 'path';
import fs from 'fs';
import { FileNode, IFileNode } from '../models/FileNode';
import { Feature, IFeature } from '../models/Feature';
import { SearchHistory } from '../models/SearchHistory';
import { Project } from '../models/Project';

const SYNONYMS: Record<string, string[]> = {
  auth: ['authentication', 'authorization', 'login', 'signin', 'signup', 'register', 'logout', 'jwt', 'token', 'session', 'passport', 'guard', 'middleware', 'bcrypt', 'password', 'user'],
  authentication: ['auth', 'login', 'signin', 'signup', 'register', 'jwt', 'token', 'session', 'passport', 'guard', 'credentials'],
  login: ['auth', 'authentication', 'signin', 'token', 'session', 'passport', 'credentials'],
  signup: ['register', 'create account', 'user creation', 'signup', 'auth'],
  register: ['signup', 'create account', 'user creation', 'auth'],
  payment: ['stripe', 'paypal', 'checkout', 'billing', 'cart', 'order', 'transaction', 'invoice', 'card'],
  stripe: ['payment', 'checkout', 'billing', 'transaction', 'invoice'],
  user: ['profile', 'member', 'account', 'email', 'avatar', 'userinfo'],
  product: ['item', 'catalog', 'store', 'inventory', 'pricing'],
  forgot: ['password reset', 'reset password', 'forgot password', 'recovery', 'email verification'],
  dashboard: ['stats', 'overview', 'main', 'analytics', 'charts'],
  notification: ['email', 'sms', 'alert', 'push notification', 'bell', 'message'],
};

const resolveRelativeImport = (importerPath: string, importTarget: string): string => {
  if (importTarget.startsWith('@/')) {
    return 'src/' + importTarget.substring(2);
  }
  
  const parentParts = importerPath.split('/').slice(0, -1);
  const targetParts = importTarget.split('/');

  for (const part of targetParts) {
    if (part === '.' || part === '') {
      continue;
    } else if (part === '..') {
      parentParts.pop();
    } else {
      parentParts.push(part);
    }
  }

  return parentParts.join('/');
};

export class FeatureSearchService {
  /**
   * Expand user query using synonym definitions
   */
  public static getSearchTerms(query: string): string[] {
    const cleanQuery = query.toLowerCase().trim();
    const terms = new Set<string>([cleanQuery]);

    // Simple word splitting
    const words = cleanQuery.split(/[\s_-]+/);
    words.forEach(word => {
      terms.add(word);
      if (SYNONYMS[word]) {
        SYNONYMS[word].forEach(syn => terms.add(syn));
      }
    });

    // Check full query synonyms
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (cleanQuery.includes(key) || key.includes(cleanQuery)) {
        syns.forEach(syn => terms.add(syn));
        terms.add(key);
      }
    }

    return Array.from(terms);
  }

  /**
   * Search files, scores matches, and builds cached Feature document
   */
  public static async searchFeatures(projectId: string, query: string, userId: string): Promise<IFeature> {
    const cleanQuery = query.toLowerCase().trim();
    
    // 1. Check if cached feature exists
    const cachedFeature = await Feature.findOne({ project: projectId, query: cleanQuery });
    if (cachedFeature) {
      cachedFeature.viewsCount += 1;
      await cachedFeature.save();

      // Log search history asynchronously
      await SearchHistory.create({ project: projectId, query: cleanQuery, user: userId });
      return cachedFeature;
    }

    // 2. Fetch all nodes for this project
    const fileNodes = await FileNode.find({ project: projectId });
    if (fileNodes.length === 0) {
      throw new Error('Project contains no scanned files. Please run or wait for scan project to finish.');
    }

    const searchTerms = this.getSearchTerms(cleanQuery);
    
    // Mapping path extensions & names for fast checks
    const nodesMap = new Map<string, IFileNode>();
    for (const node of fileNodes) {
      const fullPath = node.path;
      const ext = path.extname(fullPath);
      const pathWithoutExt = ext ? fullPath.slice(0, -ext.length) : fullPath;

      nodesMap.set(fullPath, node);
      nodesMap.set(pathWithoutExt, node);
      if (pathWithoutExt.endsWith('/index')) {
        const folderPath = pathWithoutExt.slice(0, -6);
        nodesMap.set(folderPath, node);
      }
    }

    const scoredFiles: Array<{ node: IFileNode; score: number }> = [];

    // 3. Compute score for each file node
    for (const node of fileNodes) {
      if (node.type === 'directory') continue;

      let score = 0;
      const pathLower = node.path.toLowerCase();
      const nameLower = node.name.toLowerCase();

      for (const term of searchTerms) {
        // Filename exact/partial matches
        if (nameLower === term || nameLower.replace(/\.[^/.]+$/, '') === term) {
          score += 50;
        } else if (nameLower.includes(term)) {
          score += 20;
        }

        // Folder matches
        if (pathLower.includes(`/${term}/`) || pathLower.startsWith(`${term}/`)) {
          score += 15;
        }

        // Classes / Methods matches
        for (const cls of node.classes || []) {
          if (cls.name.toLowerCase().includes(term)) {
            score += 30;
          }
          for (const method of cls.methods || []) {
            if (method.toLowerCase().includes(term)) {
              score += 15;
            }
          }
        }

        // Functions matches
        for (const fn of node.functions || []) {
          if (fn.name.toLowerCase().includes(term)) {
            score += 15;
          }
        }

        // Imports / Exports matches
        for (const imp of node.imports || []) {
          if (imp.toLowerCase().includes(term)) {
            score += 5;
          }
        }
        for (const exp of node.exports || []) {
          if (exp.toLowerCase().includes(term)) {
            score += 10;
          }
        }
      }

      if (score > 10) {
        scoredFiles.push({ node, score });
      }
    }

    // Sort by descending score
    scoredFiles.sort((a, b) => b.score - a.score);

    // If nothing matches above threshold, generate a default fallback search
    const matchedFilesList = scoredFiles.slice(0, 30).map(f => f.node.path);
    const topScored = scoredFiles[0];

    const matchedNodes = scoredFiles.slice(0, 30).map(f => f.node);

    // Group files by type
    const apis: string[] = [];
    const components: string[] = [];
    const models: string[] = [];
    const databases: string[] = [];
    const dependencies: string[] = [];

    matchedNodes.forEach(node => {
      const pathLower = node.path.toLowerCase();
      
      // Determine APIs / Routes
      if (pathLower.includes('route') || pathLower.includes('controller') || pathLower.includes('api/')) {
        apis.push(node.path);
      }

      // Determine Components
      if (pathLower.includes('component') || pathLower.includes('page') || pathLower.includes('screen') || node.name.endsWith('.tsx') || node.name.endsWith('.jsx')) {
        components.push(node.path);
      }

      // Determine Models
      if (pathLower.includes('model') || pathLower.includes('schema') || pathLower.includes('entity')) {
        models.push(node.path);
      }

      // Determine Databases used (looking at dependencies/imports)
      node.imports.forEach(imp => {
        if (imp.includes('mongoose') || imp.includes('mongodb')) {
          if (!databases.includes('MongoDB')) databases.push('MongoDB');
        }
        if (imp.includes('redis') || imp.includes('ioredis')) {
          if (!databases.includes('Redis')) databases.push('Redis');
        }
        if (imp.includes('sequelize') || imp.includes('pg') || imp.includes('mysql')) {
          if (!databases.includes('SQL Database')) databases.push('SQL Database');
        }

        // External dependencies
        if (!imp.startsWith('.') && !imp.startsWith('@/')) {
          if (!dependencies.includes(imp)) {
            dependencies.push(imp);
          }
        }
      });
    });

    const entryPoint = topScored ? topScored.node.path : '';
    const confidenceScore = topScored ? Math.min(100, Math.round(topScored.score)) : 0;

    // 4. Build graph nodes & edges
    const graphNodes: any[] = [];
    const graphEdges: any[] = [];
    const edgeKeySet = new Set<string>();

    matchedNodes.forEach(node => {
      let nodeType = 'utility';
      const pathLower = node.path.toLowerCase();

      if (pathLower.includes('/pages/') || pathLower.includes('/views/')) {
        nodeType = 'page';
      } else if (pathLower.includes('/components/')) {
        nodeType = 'component';
      } else if (pathLower.includes('/routes/') || pathLower.includes('/router/')) {
        nodeType = 'route';
      } else if (pathLower.includes('/controllers/') || pathLower.includes('/controller/')) {
        nodeType = 'controller';
      } else if (pathLower.includes('/services/') || pathLower.includes('/service/')) {
        nodeType = 'service';
      } else if (pathLower.includes('/models/') || pathLower.includes('/model/')) {
        nodeType = 'model';
      } else if (pathLower.includes('/middlewares/') || pathLower.includes('/middleware/')) {
        nodeType = 'middleware';
      }

      graphNodes.push({
        id: node.path,
        label: node.name,
        type: nodeType,
      });

      // Tracing connections based on imports
      node.imports.forEach(imp => {
        let resolved = imp;
        if (imp.startsWith('.') || imp.startsWith('@/')) {
          resolved = resolveRelativeImport(node.path, imp);
        }

        const targetNode = nodesMap.get(resolved);
        if (targetNode && matchedFilesList.includes(targetNode.path) && targetNode.path !== node.path) {
          const edgeKey = `${node.path}->${targetNode.path}`;
          if (!edgeKeySet.has(edgeKey)) {
            edgeKeySet.add(edgeKey);
            graphEdges.push({
              source: node.path,
              target: targetNode.path,
              type: 'imports',
            });
          }
        }
      });
    });

    // Generate readable description & title
    const name = query.charAt(0).toUpperCase() + query.slice(1) + ' Feature';
    let description = `Scanned entry points and AST nodes related to '${query}'.`;
    if (matchedNodes.length > 0) {
      description += ` Traced ${matchedNodes.length} file configurations mapping to controllers, routers, or database entities.`;
    }

    // Save Feature to database Cache
    const newFeature = new Feature({
      project: projectId,
      query: cleanQuery,
      name,
      description,
      confidenceScore,
      entryPoint,
      files: matchedFilesList,
      apis,
      components,
      models,
      databases,
      dependencies,
      viewsCount: 1,
      graph: {
        nodes: graphNodes,
        edges: graphEdges,
      },
    });

    await newFeature.save();

    // Log history
    await SearchHistory.create({ project: projectId, query: cleanQuery, user: userId });

    return newFeature;
  }

  /**
   * Smart query recommendations when search yields empty results
   */
  public static getSuggestions(query: string): string[] {
    const queryLower = query.toLowerCase().trim();
    const suggestions: string[] = [];

    // Check vocabulary matching
    const vocabulary = ['auth', 'authentication', 'login', 'signup', 'register', 'stripe', 'payment', 'billing', 'checkout', 'user', 'profile', 'forgot password', 'notification', 'dashboard', 'settings', 'database'];
    
    vocabulary.forEach(word => {
      if (word.includes(queryLower) || queryLower.includes(word)) {
        suggestions.push(word);
      }
    });

    // Levenshtein distance check (simple fallback)
    if (suggestions.length === 0) {
      vocabulary.forEach(word => {
        let dist = 0;
        const limit = Math.max(word.length, queryLower.length);
        for (let i = 0; i < limit; i++) {
          if (word[i] !== queryLower[i]) dist++;
        }
        if (dist <= 3) {
          suggestions.push(word);
        }
      });
    }

    return suggestions.slice(0, 5);
  }
}

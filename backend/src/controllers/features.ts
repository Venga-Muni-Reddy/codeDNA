import { Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { Feature } from '../models/Feature';
import { SearchHistory } from '../models/SearchHistory';
import { Project } from '../models/Project';
import { FileNode } from '../models/FileNode';
import { AuthenticatedRequest } from '../middlewares/auth';
import { AppError } from '../utils/errors';
import { FeatureSearchService } from '../services/FeatureSearchService';
import { askGemini } from '../services/ai';

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');

export const searchFeatures = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId, q } = req.query;
    const userId = req.user?.userId;

    if (!projectId || !q) {
      throw new AppError('Missing projectId or query string parameter (q)', 400);
    }

    const queryStr = q as string;
    const projIdStr = projectId as string;

    // Check project authorization
    const project = await Project.findOne({ _id: projIdStr, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    try {
      const feature = await FeatureSearchService.searchFeatures(projIdStr, queryStr, userId!);
      
      res.status(200).json({
        success: true,
        message: 'Feature search completed',
        data: {
          feature,
          suggestions: [],
        },
        errors: null,
        meta: {},
      });
    } catch (err: any) {
      // If we failed because there are no matching files, yield smart suggestions
      const suggestions = FeatureSearchService.getSuggestions(queryStr);
      res.status(200).json({
        success: true,
        message: 'No features found matching the criteria',
        data: {
          feature: null,
          suggestions,
        },
        errors: null,
        meta: {},
      });
    }
  } catch (error) {
    next(error);
  }
};

export const getFeature = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id).populate('project');
    if (!feature) {
      throw new AppError('Feature cache not found', 404);
    }

    // Verify ownership
    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    feature.viewsCount += 1;
    await feature.save();

    res.status(200).json({
      success: true,
      message: 'Feature retrieved successfully',
      data: {
        feature,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getFeatureGraph = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    res.status(200).json({
      success: true,
      message: 'Feature graph retrieved successfully',
      data: feature.graph,
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getFeatureDependencies = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    res.status(200).json({
      success: true,
      message: 'Dependencies retrieved successfully',
      data: {
        dependencies: feature.dependencies,
        filesCount: feature.files.length,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getFeatureFlow = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    // Convert nodes to structured request flow layout
    const pageNodes = feature.graph.nodes.filter(n => n.type === 'page' || n.type === 'component');
    const routeNodes = feature.graph.nodes.filter(n => n.type === 'route' || n.type === 'middleware');
    const logicNodes = feature.graph.nodes.filter(n => n.type === 'controller' || n.type === 'service');
    const modelNodes = feature.graph.nodes.filter(n => n.type === 'model');

    res.status(200).json({
      success: true,
      message: 'Sequence execution layout retrieved',
      data: {
        layers: {
          client: pageNodes,
          routing: routeNodes,
          logic: logicNodes,
          storage: modelNodes,
        },
        edges: feature.graph.edges,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const explainFeature = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { featureId, filePath, query } = req.body;
    const userId = req.user?.userId;

    if (!featureId || !query) {
      throw new AppError('Missing featureId or query text', 400);
    }

    const feature = await Feature.findById(featureId);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    let prompt = '';

    if (filePath) {
      const fileNode = await FileNode.findOne({ project: feature.project, path: filePath });
      if (!fileNode) {
        throw new AppError('Selected file does not exist in project metadata registry', 404);
      }

      const fileFullPath = path.join(PROJECTS_ROOT, feature.project.toString(), filePath);
      if (!fs.existsSync(fileFullPath)) {
        throw new AppError('Source file code content is not found on disk storage', 404);
      }

      const fileContent = fs.readFileSync(fileFullPath, 'utf-8');

      prompt = `You are a Senior Software Architect. Explain this code module inside the context of the '${feature.name}' feature.
      
Feature: ${feature.name}
Feature Description: ${feature.description}
File Name: ${fileNode.name}
File Path: ${fileNode.path}

Code Content:
\`\`\`
${fileContent.slice(0, 20000)}
\`\`\`

User Query: ${query}

Explain exactly what this file does, how it contributes to the '${feature.name}' workflow, and how functions interact. Formatter output in Markdown.`;
    } else {
      // Scopes explanation on general flow
      prompt = `You are a Senior Software Architect. Explain the structural flow and request chain of this feature in the codebase.

Feature: ${feature.name}
Description: ${feature.description}
Matched APIs: ${feature.apis.join(', ') || 'None'}
Model Schemas: ${feature.models.join(', ') || 'None'}
Files participating:
${feature.files.map(f => ` - ${f}`).join('\n')}

User Query: ${query}

Give a comprehensive, step-by-step breakdown of how data flows (e.g. from Routes to Controllers, Services, and Models) for this feature. Formatter output in Markdown.`;
    }

    const explanation = await askGemini(prompt);

    res.status(200).json({
      success: true,
      message: 'AI explanation successfully generated',
      data: {
        explanation,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const togglePin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    feature.isPinned = !feature.isPinned;
    await feature.save();

    res.status(200).json({
      success: true,
      message: feature.isPinned ? 'Feature pinned successfully' : 'Feature unpinned successfully',
      data: {
        feature,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const toggleFavorite = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const feature = await Feature.findById(id);
    if (!feature) {
      throw new AppError('Feature not found', 404);
    }

    const project = await Project.findOne({ _id: feature.project, owner: userId });
    if (!project) {
      throw new AppError('Access denied', 403);
    }

    feature.isFavorite = !feature.isFavorite;
    await feature.save();

    res.status(200).json({
      success: true,
      message: feature.isFavorite ? 'Added to favorites' : 'Removed from favorites',
      data: {
        feature,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getSearchHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId } = req.query;
    const userId = req.user?.userId;

    if (!projectId) {
      throw new AppError('Missing projectId parameter', 400);
    }

    const projIdStr = projectId as string;
    const project = await Project.findOne({ _id: projIdStr, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const history = await SearchHistory.find({ project: projIdStr, user: userId })
      .sort({ createdAt: -1 })
      .limit(10);

    const pinned = await Feature.find({ project: projIdStr, isPinned: true });
    const favorites = await Feature.find({ project: projIdStr, isFavorite: true });

    res.status(200).json({
      success: true,
      message: 'History and preferences retrieved',
      data: {
        history: history.map(h => h.query),
        pinned,
        favorites,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

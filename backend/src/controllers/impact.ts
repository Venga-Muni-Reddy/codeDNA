import { Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { FileNode } from '../models/FileNode';
import { ImpactReport } from '../models/ImpactReport';
import { Project } from '../models/Project';
import { AuthenticatedRequest } from '../middlewares/auth';
import { AppError } from '../utils/errors';
import { ImpactAnalyzerService } from '../services/ImpactAnalyzerService';
import { askGemini } from '../services/ai';

const PROJECTS_ROOT = path.join(__dirname, '..', '..', 'projects');

export const getFileImpact = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filePath = (req.query.filePath || req.params.id) as string;
    const { projectId } = req.query;
    const userId = req.user?.userId;

    if (!projectId) {
      throw new AppError('Missing projectId query parameter', 400);
    }

    const project = await Project.findOne({ _id: projectId as string, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const report = await ImpactAnalyzerService.analyzeFile(projectId as string, filePath);

    res.status(200).json({
      success: true,
      message: 'Impact analysis completed successfully',
      data: {
        report,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getImpactGraph = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filePath = (req.query.filePath || req.params.id) as string;
    const { projectId } = req.query;
    const userId = req.user?.userId;

    if (!projectId) {
      throw new AppError('Missing projectId parameter', 400);
    }

    const project = await Project.findOne({ _id: projectId as string, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const report = await ImpactAnalyzerService.analyzeFile(projectId as string, filePath);

    res.status(200).json({
      success: true,
      message: 'Impact graph retrieved successfully',
      data: report.graph,
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getImpactRisk = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filePath = (req.query.filePath || req.params.id) as string;
    const { projectId } = req.query;
    const userId = req.user?.userId;

    if (!projectId) {
      throw new AppError('Missing projectId parameter', 400);
    }

    const project = await Project.findOne({ _id: projectId as string, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const report = await ImpactAnalyzerService.analyzeFile(projectId as string, filePath);

    res.status(200).json({
      success: true,
      message: 'Impact risk retrieved successfully',
      data: {
        riskScore: report.riskScore,
        riskLabel: report.riskLabel,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const getImpactBusiness = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filePath = (req.query.filePath || req.params.id) as string;
    const { projectId } = req.query;
    const userId = req.user?.userId;

    if (!projectId) {
      throw new AppError('Missing projectId parameter', 400);
    }

    const project = await Project.findOne({ _id: projectId as string, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const report = await ImpactAnalyzerService.analyzeFile(projectId as string, filePath);

    res.status(200).json({
      success: true,
      message: 'Business features mapped successfully',
      data: {
        businessFeatures: report.businessFeatures,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const simulateChange = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fileNodeId, projectId, action, newName } = req.body;
    const userId = req.user?.userId;

    if (!fileNodeId || !projectId || !action) {
      throw new AppError('Missing fileNodeId, projectId, or action in body', 400);
    }

    const project = await Project.findOne({ _id: projectId, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const simulation = await ImpactAnalyzerService.simulateChange(projectId, fileNodeId, action, newName);

    res.status(200).json({
      success: true,
      message: 'Change simulation calculated successfully',
      data: simulation,
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const explainImpact = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fileNodeId, projectId, query } = req.body;
    const userId = req.user?.userId;

    if (!fileNodeId || !projectId || !query) {
      throw new AppError('Missing fileNodeId, projectId, or query in body', 400);
    }

    const project = await Project.findOne({ _id: projectId, owner: userId });
    if (!project) {
      throw new AppError('Project not found or access denied', 404);
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(fileNodeId);
    const fileNode = isObjectId
      ? await FileNode.findOne({ _id: fileNodeId, project: projectId })
      : await FileNode.findOne({ path: fileNodeId, project: projectId });

    if (!fileNode) {
      throw new AppError('File node not found', 404);
    }

    const report = await ImpactAnalyzerService.analyzeFile(projectId, fileNode._id.toString());

    const prompt = `You are a Principal Software Architect. Explain the structural risk and impact of editing the following code file in the system.

File Name: ${fileNode.name}
File Path: ${fileNode.path}
Risk Index: ${report.riskScore} (${report.riskLabel})
Impacted Business Areas: ${report.businessFeatures.join(', ') || 'General Component'}
Direct affected files count: ${report.directAffected.length}
Indirect affected files count: ${report.indirectAffected.length}

List of direct files depending on this:
${report.directAffected.slice(0, 15).map((f: string) => ` - ${f}`).join('\n')}

User Query: ${query}

Explain why this file has this specific risk index, what might break if they change it, and suggest a migration or refactoring path. Limit responses to Markdown formatting.`;

    const explanation = await askGemini(prompt);

    res.status(200).json({
      success: true,
      message: 'AI impact explanation generated successfully',
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

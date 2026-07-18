import { Project as TsProject } from 'ts-morph';
import fs from 'fs';
import path from 'path';

export interface ParsedFileData {
  classes: { name: string; methods: string[]; startLine: number; endLine: number }[];
  functions: { name: string; startLine: number; endLine: number }[];
  imports: string[];
  exports: string[];
}

/**
 * Parses JS/TS files using ts-morph AST analyzer
 */
export const parseJsTsFile = (filePath: string): ParsedFileData => {
  const result: ParsedFileData = {
    classes: [],
    functions: [],
    imports: [],
    exports: [],
  };

  try {
    const project = new TsProject({
      compilerOptions: { allowJs: true },
    });
    const sourceFile = project.addSourceFileAtPath(filePath);

    // 1. Extract Imports
    const importDeclarations = sourceFile.getImportDeclarations();
    for (const imp of importDeclarations) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      result.imports.push(moduleSpecifier);
    }

    // 2. Extract Classes
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const className = cls.getName() || 'AnonymousClass';
      const methods = cls.getMethods().map((m) => m.getName());
      const startLine = cls.getStartLineNumber();
      const endLine = cls.getEndLineNumber();
      result.classes.push({ name: className, methods, startLine, endLine });
    }

    // 3. Extract Functions
    const functions = sourceFile.getFunctions();
    for (const fn of functions) {
      const fnName = fn.getName();
      if (fnName) {
        const startLine = fn.getStartLineNumber();
        const endLine = fn.getEndLineNumber();
        result.functions.push({ name: fnName, startLine, endLine });
      }
    }

    // 4. Extract Exports
    const exportSymbols = sourceFile.getExportSymbols();
    for (const sym of exportSymbols) {
      result.exports.push(sym.getName());
    }
  } catch (error) {
    console.error(`[AST Parser] Failed parsing JS/TS AST for ${filePath}:`, (error as Error).message);
  }

  return result;
};

/**
 * Fallback regex-based parser for non-JS/TS files (Python, Java, etc.)
 */
export const parseFallbackFile = (filePath: string): ParsedFileData => {
  const result: ParsedFileData = {
    classes: [],
    functions: [],
    imports: [],
    exports: [],
  };

  try {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (ext === '.py') {
      // Python imports: "import os", "from flask import Flask"
      const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_.-]+)/;
      // Python classes: "class DatabaseManager:"
      const classRegex = /^\s*class\s+([a-zA-Z0-9_]+)/;
      // Python functions: "def save_user(user):"
      const funcRegex = /^\s*def\s+([a-zA-Z0-9_]+)/;

      lines.forEach((line, idx) => {
        const impMatch = line.match(importRegex);
        if (impMatch) result.imports.push(impMatch[1]);

        const clsMatch = line.match(classRegex);
        if (clsMatch) {
          result.classes.push({
            name: clsMatch[1],
            methods: [], // Keep it simple
            startLine: idx + 1,
            endLine: idx + 1,
          });
        }

        const fnMatch = line.match(funcRegex);
        if (fnMatch) {
          result.functions.push({
            name: fnMatch[1],
            startLine: idx + 1,
            endLine: idx + 1,
          });
        }
      });
    } else if (ext === '.java') {
      // Java imports: "import java.util.List;"
      const importRegex = /^\s*import\s+([a-zA-Z0-9_.*-]+);/;
      // Java classes: "public class UserServiceImpl implements UserService"
      const classRegex = /^\s*(?:public|private|protected)?\s*class\s+([a-zA-Z0-9_]+)/;

      lines.forEach((line, idx) => {
        const impMatch = line.match(importRegex);
        if (impMatch) result.imports.push(impMatch[1]);

        const clsMatch = line.match(classRegex);
        if (clsMatch) {
          result.classes.push({
            name: clsMatch[1],
            methods: [],
            startLine: idx + 1,
            endLine: idx + 1,
          });
        }
      });
    }
  } catch (error) {
    console.error(`[Fallback Parser] Error parsing ${filePath}:`, (error as Error).message);
  }

  return result;
};

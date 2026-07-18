import fs from 'fs';
import path from 'path';

/**
 * Detects the technologies and frameworks used in a project.
 * Inspects package logs, configuration files, and markers in the project path.
 */
export const detectTechStack = async (projectPath: string): Promise<string[]> => {
  const detected: string[] = [];

  try {
    if (!fs.existsSync(projectPath)) {
      return detected;
    }

    const files = fs.readdirSync(projectPath);

    // 1. Node.js & Javascript Ecosystem
    if (files.includes('package.json')) {
      detected.push('Node.js');
      try {
        const pkgContent = JSON.parse(
          fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8')
        );
        const deps = { ...pkgContent.dependencies, ...pkgContent.devDependencies };

        if (deps['react']) detected.push('React');
        if (deps['next']) detected.push('Next.js');
        if (deps['vue'] || deps['nuxt']) detected.push('Vue');
        if (deps['@angular/core']) detected.push('Angular');
        if (deps['express']) detected.push('Express');
        if (deps['@nestjs/core']) detected.push('NestJS');
      } catch (err) {
        console.error('[Detector] Error parsing package.json:', err);
      }
    }

    // 2. Python Ecosystem
    if (files.includes('requirements.txt') || files.includes('Pipfile') || files.includes('pyproject.toml') || files.includes('manage.py')) {
      detected.push('Python');
      if (files.includes('manage.py')) {
        detected.push('Django');
      }

      const reqPath = path.join(projectPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
        if (reqContent.includes('fastapi')) detected.push('FastAPI');
        if (reqContent.includes('flask')) detected.push('Flask');
        if (reqContent.includes('django') && !detected.includes('Django')) detected.push('Django');
      }
    }

    // 3. Java Ecosystem
    if (files.includes('pom.xml') || files.includes('build.gradle')) {
      detected.push('Java');
      if (files.includes('pom.xml')) {
        const pomContent = fs.readFileSync(path.join(projectPath, 'pom.xml'), 'utf-8');
        if (pomContent.includes('spring-boot')) detected.push('Spring Boot');
      }
      if (files.includes('build.gradle')) {
        const gradleContent = fs.readFileSync(path.join(projectPath, 'build.gradle'), 'utf-8');
        if (gradleContent.includes('spring-boot')) detected.push('Spring Boot');
      }
    }

    // 4. PHP Ecosystem
    if (files.includes('composer.json') || files.includes('artisan')) {
      detected.push('PHP');
      if (files.includes('artisan')) {
        detected.push('Laravel');
      }
    }

  } catch (error) {
    console.error('[Detector] Stack detection error:', error);
  }

  return Array.from(new Set(detected));
};

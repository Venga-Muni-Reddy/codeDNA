import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Extracts a ZIP file to a target destination directory.
 * Uses Windows-native `tar -xf` command.
 */
export const extractZip = (zipPath: string, destDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });

    // Clean paths to be safe for CLI execution
    const safeZipPath = path.normalize(zipPath);
    const safeDestDir = path.normalize(destDir);

    // tar -xf "zipfile" -C "dest"
    const command = `tar -xf "${safeZipPath}" -C "${safeDestDir}"`;

    exec(command, (error, _stdout, stderr) => {
      if (error) {
        console.error('[Extract Error Stderr]:', stderr);
        return reject(new Error(`Extraction failed: ${error.message}`));
      }
      resolve();
    });
  });
};

/**
 * Clones a Git repository to a target destination directory.
 * Spawns `git clone --depth=1` to minimize ingestion time.
 */
export const cloneGit = (repoUrl: string, destDir: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!/^(https?|git|ssh):\/\/[a-z0-9._-]+(\/[a-z0-9._-]+)*(\.git)?\/?$/i.test(repoUrl)) {
      return reject(new Error('Invalid repository URL structure'));
    }

    fs.mkdirSync(destDir, { recursive: true });

    const safeDestDir = path.normalize(destDir);
    const command = `git clone "${repoUrl}" "${safeDestDir}" --depth=1`;

    exec(command, (error, _stdout, stderr) => {
      if (error) {
        console.error('[Git Clone Error Stderr]:', stderr);
        return reject(new Error(`Git clone failed: ${error.message}`));
      }

      // Try to read commit hash
      exec('git rev-parse HEAD', { cwd: safeDestDir }, (commitErr, commitStdout) => {
        if (commitErr) {
          return resolve('unknown');
        }
        resolve(commitStdout.trim());
      });
    });
  });
};

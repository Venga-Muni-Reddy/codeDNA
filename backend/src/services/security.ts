import { ISecurityIssue } from '../models/ScanResult';

/**
 * Scans a file's content line-by-line using regex security rule signatures.
 * Returns classified security alerts.
 */
export const scanSecurity = (relPath: string, fileContent: string): ISecurityIssue[] => {
  const issues: ISecurityIssue[] = [];
  const lines = fileContent.split('\n');

  const rules = [
    {
      type: 'Hardcoded Secret',
      severity: 'high' as const,
      description: 'Potential hardcoded API key, password, or token detected.',
      regex: /(api_key|apikey|secret|password|passwd|private_key|token|auth_key|jwt_secret)\s*=\s*['"`]([a-zA-Z0-9_\-+=]{8,})['"`]/i,
    },
    {
      type: 'Dangerous Eval',
      severity: 'critical' as const,
      description: 'Use of eval() allows arbitrary code execution and is highly dangerous.',
      regex: /\beval\s*\(/,
    },
    {
      type: 'Dynamic Function Construction',
      severity: 'high' as const,
      description: 'Creating functions dynamically via new Function() can lead to injection vulnerabilities.',
      regex: /\bnew\s+Function\s*\(/,
    },
    {
      type: 'SQL Injection Risk',
      severity: 'critical' as const,
      description: 'Direct string concatenation in database query string detected. Use parameterized queries instead.',
      regex: /\bquery\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\b[^+`]*\+\s*[a-zA-Z0-9_]+/i,
    },
    {
      type: 'SQL Injection Risk (Template Literal)',
      severity: 'critical' as const,
      description: 'Template string interpolation detected inside database query. Use parameterized statements to prevent SQL Injection.',
      regex: /\bquery\s*\(\s*`(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\b[^`]*\$\{/i,
    },
    {
      type: 'Unsafe CORS Configuration',
      severity: 'medium' as const,
      description: 'CORS policy configured with wildcard "*" origin. This allows access from any origin.',
      regex: /origin\s*:\s*['"`]\*['"`]/i,
    },
    {
      type: 'Weak JWT Secret Configuration',
      severity: 'high' as const,
      description: 'JWT signing uses "secret" or dummy key. Configure a strong environment secret.',
      regex: /jwt\.sign\s*\([^,]+,\s*['"`](?:secret|test|dev|dummy|temp)['"`]/i,
    },
  ];

  lines.forEach((line, idx) => {
    for (const rule of rules) {
      if (rule.regex.test(line)) {
        issues.push({
          severity: rule.severity,
          file: relPath,
          line: idx + 1,
          type: rule.type,
          description: rule.description,
          code: line.trim(),
        });
      }
    }
  });

  return issues;
};

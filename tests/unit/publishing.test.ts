import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Publishing Configuration', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );

  describe('package.json validation', () => {
    it('should have required npm metadata', () => {
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.description).toBeDefined();
      expect(packageJson.license).toBeDefined();
      expect(packageJson.main).toBeDefined();
    });

    it('should have valid semver version', () => {
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      expect(packageJson.version).toMatch(semverRegex);
    });

    it('should have repository information', () => {
      expect(packageJson.repository).toBeDefined();
      expect(packageJson.repository.type).toBe('git');
      expect(packageJson.repository.url).toBeDefined();
    });

    it('should have author information', () => {
      expect(packageJson.author).toBeDefined();
    });

    it('should specify files to include', () => {
      expect(packageJson.files).toBeDefined();
      expect(Array.isArray(packageJson.files)).toBe(true);
      expect(packageJson.files).toContain('dist');
    });

    it('should have n8n configuration', () => {
      expect(packageJson.n8n).toBeDefined();
      expect(packageJson.n8n.n8nNodesApiVersion).toBeDefined();
      expect(packageJson.n8n.nodes).toBeDefined();
      expect(Array.isArray(packageJson.n8n.nodes)).toBe(true);
    });

    it('should have n8n community node package keyword', () => {
      expect(packageJson.keywords).toBeDefined();
      expect(packageJson.keywords).toContain('n8n-community-node-package');
    });

    it('should specify Node.js engine requirement', () => {
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.node).toBeDefined();
    });
  });

  describe('GitHub Actions workflow validation', () => {
    it('should have publish workflow file', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it('should have valid publish workflow configuration', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const workflow = yaml.load(workflowContent) as any;

      expect(workflow.name).toBe('Publish to npm');
      expect(workflow.on.push.tags).toContain('v*');
    });

    it('publish workflow should have required jobs', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const workflow = yaml.load(workflowContent) as any;

      expect(workflow.jobs.test).toBeDefined();
      expect(workflow.jobs.build).toBeDefined();
      expect(workflow.jobs.publish).toBeDefined();
    });

    it('publish job should verify version matches tag', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');

      expect(workflowContent).toContain('Verify version matches tag');
      expect(workflowContent).toContain('TAG_VERSION');
      expect(workflowContent).toContain('PACKAGE_VERSION');
    });

    it('publish job should check for existing npm version', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');

      expect(workflowContent).toContain('Check if version already published');
      expect(workflowContent).toContain('npm view');
    });

    it('publish job should use npm provenance', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');

      expect(workflowContent).toContain('--provenance');
    });

    it('publish job should have required permissions', () => {
      const workflowPath = path.join(rootDir, '.github/workflows/publish.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const workflow = yaml.load(workflowContent) as any;

      expect(workflow.jobs.publish.permissions).toBeDefined();
      expect(workflow.jobs.publish.permissions['id-token']).toBe('write');
    });
  });

  describe('.npmignore validation', () => {
    it('should have .npmignore file', () => {
      const npmignorePath = path.join(rootDir, '.npmignore');
      expect(fs.existsSync(npmignorePath)).toBe(true);
    });

    it('should exclude source files', () => {
      const npmignorePath = path.join(rootDir, '.npmignore');
      const content = fs.readFileSync(npmignorePath, 'utf-8');

      expect(content).toContain('src/');
      expect(content).toContain('*.ts');
    });

    it('should exclude test files', () => {
      const npmignorePath = path.join(rootDir, '.npmignore');
      const content = fs.readFileSync(npmignorePath, 'utf-8');

      expect(content).toContain('__tests__/');
      expect(content).toContain('*.test.ts');
      expect(content).toContain('*.spec.ts');
    });

    it('should exclude CI/CD files', () => {
      const npmignorePath = path.join(rootDir, '.npmignore');
      const content = fs.readFileSync(npmignorePath, 'utf-8');

      expect(content).toContain('.github/');
    });

    it('should exclude development files', () => {
      const npmignorePath = path.join(rootDir, '.npmignore');
      const content = fs.readFileSync(npmignorePath, 'utf-8');

      expect(content).toContain('tsconfig.json');
      expect(content).toContain('.eslintrc');
    });
  });

  describe('Build output validation', () => {
    it('should include dist directory in files', () => {
      expect(packageJson.files).toContain('dist');
    });

    it('should have build script', () => {
      expect(packageJson.scripts.build).toBeDefined();
    });

    it('main entry point should be in dist', () => {
      expect(packageJson.main).toMatch(/^dist\//);
    });

    it('n8n node files should be in dist', () => {
      packageJson.n8n.nodes.forEach((nodePath: string) => {
        expect(nodePath).toMatch(/^dist\//);
      });
    });
  });

  describe('Version tag format', () => {
    it('should follow semver format with v prefix', () => {
      const version = packageJson.version;
      const tagFormat = `v${version}`;
      const tagRegex = /^v\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

      expect(tagFormat).toMatch(tagRegex);
    });
  });

  describe('npm pack dry run', () => {
    it('should successfully pack without errors', async () => {
      const { execSync } = require('child_process');

      expect(() => {
        execSync('npm pack --dry-run', {
          cwd: rootDir,
          encoding: 'utf-8',
        });
      }).not.toThrow();
    });

    it('packed tarball should include only dist directory', async () => {
      const { execSync } = require('child_process');

      const output = execSync('npm pack --dry-run 2>&1', {
        cwd: rootDir,
        encoding: 'utf-8',
      });

      // Should include dist files
      expect(output).toMatch(/dist\//);

      // Should NOT include source files
      expect(output).not.toMatch(/src\//);
      expect(output).not.toMatch(/__tests__\//);
      expect(output).not.toMatch(/\.github\//);
    });
  });
});

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function resolveMarkdownArg(args: Record<string, string>): string[] {
  const markdownFile = args['markdown-file']?.trim();
  if (markdownFile) {
    const resolved = path.resolve(markdownFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`markdown file not found: ${resolved}`);
    }
    return ['--markdown', fs.readFileSync(resolved, 'utf8')];
  }

  const markdown = args.markdown?.trim();
  if (markdown) {
    return ['--markdown', markdown];
  }

  throw new Error('missing --markdown-file or --markdown');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const document = args.document?.trim()
    || args.target?.trim()
    || args.url?.trim()
    || args['document-id']?.trim()
    || process.env.FEISHU_ITERATION_DOCX_REF?.trim()
    || process.env.FEISHU_ITERATION_DOCX?.trim()
    || process.env.FEISHU_ITERATION_DOCX_ID?.trim();

  const markdownArgs = resolveMarkdownArg(args);
  const childArgs = ['docs', '+update'];
  if (document) {
    childArgs.push('--doc', document);
  }
  childArgs.push('--mode', 'append');
  childArgs.push(...markdownArgs);
  const result = spawnSync('lark-cli', childArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main();

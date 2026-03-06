import fs from 'node:fs';
import path from 'node:path';

interface SessionFileData {
  sessions?: Record<string, string>;
}

export class SessionStore {
  private readonly filePath: string;
  private sessions: Record<string, string>;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.sessions = this.load();
  }

  get(userId: string): string | undefined {
    return this.sessions[userId];
  }

  set(userId: string, threadId: string): void {
    this.sessions[userId] = threadId;
    this.persist();
  }

  private load(): Record<string, string> {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }

    const content = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!content) {
      return {};
    }

    try {
      const parsed = JSON.parse(content) as SessionFileData;
      return parsed.sessions ?? {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    const body = JSON.stringify({ sessions: this.sessions }, null, 2);
    fs.writeFileSync(this.filePath, body, 'utf8');
  }
}

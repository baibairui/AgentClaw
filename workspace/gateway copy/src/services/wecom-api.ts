interface WeComApiOptions {
  corpId: string;
  secret: string;
  agentId: number;
}

interface TokenCache {
  value: string;
  expiresAt: number;
}

export class WeComApi {
  private readonly corpId: string;
  private readonly secret: string;
  private readonly agentId: number;
  private tokenCache?: TokenCache;

  constructor(options: WeComApiOptions) {
    this.corpId = options.corpId;
    this.secret = options.secret;
    this.agentId = options.agentId;
  }

  async sendText(toUser: string, content: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        touser: toUser,
        msgtype: 'text',
        agentid: this.agentId,
        text: {
          content,
        },
        safe: 0,
      }),
    });

    const body = (await response.json()) as { errcode?: number; errmsg?: string };
    if (!response.ok || body.errcode !== 0) {
      throw new Error(`wecom send failed: ${response.status} ${body.errcode ?? 'unknown'} ${body.errmsg ?? 'unknown'}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.value;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.secret}`;
    const response = await fetch(url);
    const body = (await response.json()) as {
      errcode?: number;
      errmsg?: string;
      access_token?: string;
      expires_in?: number;
    };

    if (!response.ok || body.errcode !== 0 || !body.access_token || !body.expires_in) {
      throw new Error(`wecom gettoken failed: ${response.status} ${body.errcode ?? 'unknown'} ${body.errmsg ?? 'unknown'}`);
    }

    this.tokenCache = {
      value: body.access_token,
      expiresAt: now + Math.max(0, body.expires_in - 60) * 1000,
    };

    return this.tokenCache.value;
  }
}

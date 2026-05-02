import { describe, expect, it } from 'vitest';

import {
  buildFeishuApiLoginFormMessage,
  buildFeishuApiLoginResultMessage,
  buildFeishuLoginChoiceMessage,
  buildFeishuOpenCodeInputFallbackMessage,
  buildFeishuOpenCodeOauthMessage,
  buildFeishuPersonalAuthUnavailableMessage,
  buildFeishuUserAuthMessage,
  formatCommandOutboundMessage,
} from '../src/services/feishu-command-cards.js';

function getCardElements(payload: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(payload) as {
    content?: {
      schema?: string;
      body?: {
        elements?: Array<Record<string, unknown>>;
      };
    };
  };
  expect(parsed.content?.schema).toBe('2.0');
  return parsed.content?.body?.elements ?? [];
}

function extractButtons(elements: Array<Record<string, unknown>>): Array<{
  text?: { content?: string };
  value?: Record<string, unknown>;
  multi_url?: { url?: string };
}> {
  return elements.flatMap((item) => {
    if (item.tag === 'button') {
      return [item];
    }
    if (item.tag === 'form') {
      return extractButtons(Array.isArray(item.elements) ? item.elements as Array<Record<string, unknown>> : []);
    }
    if (item.tag === 'column_set') {
      const columns = Array.isArray(item.columns) ? item.columns as Array<Record<string, unknown>> : [];
      return columns.flatMap((column) => extractButtons(Array.isArray(column.elements) ? column.elements as Array<Record<string, unknown>> : []));
    }
    return [];
  }) as Array<{
    text?: { content?: string };
    value?: Record<string, unknown>;
    multi_url?: { url?: string };
  }>;
}

function extractMarkdownContents(elements: Array<Record<string, unknown>>): string[] {
  return elements.flatMap((item) => {
    if (item.tag === 'markdown' && typeof item.content === 'string') {
      return [item.content];
    }
    if (item.tag === 'form') {
      return extractMarkdownContents(Array.isArray(item.elements) ? item.elements as Array<Record<string, unknown>> : []);
    }
    if (item.tag === 'column_set') {
      const columns = Array.isArray(item.columns) ? item.columns as Array<Record<string, unknown>> : [];
      return columns.flatMap((column) => extractMarkdownContents(Array.isArray(column.elements) ? column.elements as Array<Record<string, unknown>> : []));
    }
    return [];
  });
}

describe('buildFeishuLoginChoiceMessage', () => {
  it('renders both device auth and API login actions', () => {
    const payload = buildFeishuLoginChoiceMessage();
    const parsed = JSON.parse(payload) as {
      __gateway_message__?: boolean;
      msg_type?: string;
    };

    expect(parsed.__gateway_message__).toBe(true);
    expect(parsed.msg_type).toBe('interactive');
    const elements = getCardElements(payload);
    expect(elements.some((item) => item.tag === 'action')).toBe(false);
    const markdown = extractMarkdownContents(elements).join('\n');
    const buttons = extractButtons(elements);
    expect(markdown).toContain('**步骤 1**');
    expect(markdown).toContain('选择登录方式');
    expect(markdown).toContain('**建议**');
    expect(buttons.some((item) => item.text?.content === '设备授权登录' && item.value?.gateway_action === 'codex_login.start_device_auth')).toBe(true);
    expect(buttons.some((item) => item.text?.content === 'API URL / Key 登录' && item.value?.gateway_action === 'codex_login.open_api_form')).toBe(true);
  });

  it('hides device auth when provider does not support it', () => {
    const payload = buildFeishuLoginChoiceMessage({
      provider: 'opencode',
      providerLabel: 'OpenCode',
      supportsDeviceAuth: false,
    });
    const elements = getCardElements(payload);
    expect(elements.some((item) => item.tag === 'action')).toBe(false);
    const markdown = extractMarkdownContents(elements).join('\n');
    const buttons = extractButtons(elements);
    expect(markdown).toContain('**步骤 1**');
    expect(buttons.some((item) => item.text?.content === '设备授权登录')).toBe(false);
    expect(buttons.some((item) => item.text?.content === 'API URL / Key 登录')).toBe(true);
  });

  it('shows only api login for opencode in feishu', () => {
    const payload = buildFeishuLoginChoiceMessage({
      provider: 'opencode',
      providerLabel: 'OpenCode',
      supportsDeviceAuth: false,
    });
    const elements = getCardElements(payload);
    const buttons = extractButtons(elements);

    expect(elements.some((item) => item.tag === 'action')).toBe(false);
    expect(buttons.some((item) => item.text?.content === 'OpenAI')).toBe(false);
    expect(buttons.some((item) => item.text?.content === 'Anthropic')).toBe(false);
    expect(buttons.filter((item) => item.text?.content === 'API URL / Key 登录')).toHaveLength(1);
  });
});

describe('buildFeishuApiLoginFormMessage', () => {
  it('wraps login inputs inside a form card element', () => {
    const payload = buildFeishuApiLoginFormMessage();
    const parsed = JSON.parse(payload) as {
      __gateway_message__?: boolean;
      msg_type?: string;
    };

    expect(parsed.__gateway_message__).toBe(true);
    expect(parsed.msg_type).toBe('interactive');
    const elements = getCardElements(payload);
    const markdown = extractMarkdownContents(elements).join('\n');
    expect(markdown).toContain('**步骤 2**');
    expect(markdown).toContain('填写 API 配置');
    expect(markdown).toContain('**填写说明**');
    const form = elements.find((item) => item.tag === 'form') as
      | {
          name?: string;
          elements?: Array<Record<string, unknown>>;
        }
      | undefined;
    expect(form?.name).toBe('codex_api_login');
    const inputs = (form?.elements ?? []).filter((item) => item.tag === 'input');
    expect(inputs.map((item) => item.name)).toEqual(['base_url', 'api_key', 'model']);
    expect(inputs.every((item) => item.label_position === 'top')).toBe(true);
    expect(inputs.find((item) => item.name === 'base_url')?.default_value).toBe('https://codex.ai02.cn');
    expect(inputs.find((item) => item.name === 'model')?.default_value).toBe('gpt-5.3-codex');
    const submitButton = (form?.elements ?? []).find((item) => item.tag === 'button') as
      | { action_type?: string; name?: string; value?: Record<string, unknown> }
      | undefined;
    expect(submitButton?.action_type).toBe('form_submit');
    expect(submitButton?.name).toBe('submit_api_login');
    expect(submitButton?.value?.gateway_action).toBe('codex_login.submit_api_credentials');
  });

  it('pre-fills opencode base url and model as default values', () => {
    const payload = buildFeishuApiLoginFormMessage({
      provider: 'opencode',
    });
    const form = getCardElements(payload).find((item) => item.tag === 'form') as
      | {
          elements?: Array<Record<string, unknown>>;
        }
      | undefined;
    const inputs = (form?.elements ?? []).filter((item) => item.tag === 'input');

    expect(inputs.find((item) => item.name === 'base_url')?.default_value).toBe('https://api.openai.com/v1');
    expect(inputs.find((item) => item.name === 'model')?.default_value).toBe('gpt-5');
    expect(inputs.find((item) => item.name === 'reasoning_effort')?.placeholder?.content).toBe('none | minimal | low | medium | high | xhigh');
  });
});

describe('buildFeishuOpenCodeOauthMessage', () => {
  it('renders an oauth card with a direct open-link button', () => {
    const payload = buildFeishuOpenCodeOauthMessage({
      provider: 'openai',
      url: 'https://auth.example.com/oauth/start',
    });
    const parsed = JSON.parse(payload) as {
      __gateway_message__?: boolean;
      msg_type?: string;
    };

    expect(parsed.__gateway_message__).toBe(true);
    expect(parsed.msg_type).toBe('interactive');
    const elements = getCardElements(payload);
    expect(elements.some((item) => item.tag === 'action')).toBe(false);
    const markdown = extractMarkdownContents(elements).join('\n');
    const buttons = extractButtons(elements);
    expect(markdown).toContain('**步骤 3**');
    expect(markdown).toContain('打开浏览器完成授权');
    expect(buttons.some((item) => item.text?.content === '打开授权链接' && item.multi_url?.url === 'https://auth.example.com/oauth/start')).toBe(true);
  });
});

describe('buildFeishuOpenCodeInputFallbackMessage', () => {
  it('renders a minimal fallback form when oauth still needs user input', () => {
    const payload = buildFeishuOpenCodeInputFallbackMessage({
      provider: 'openai',
      prompt: 'Enter the one-time code from your authenticator app',
    });
    const parsed = JSON.parse(payload) as {
      __gateway_message__?: boolean;
      msg_type?: string;
    };

    expect(parsed.__gateway_message__).toBe(true);
    expect(parsed.msg_type).toBe('interactive');
    const elements = getCardElements(payload);
    const markdown = extractMarkdownContents(elements).join('\n');
    expect(markdown).toContain('**步骤 4**');
    expect(markdown).toContain('补充授权信息');
    const form = elements.find((item) => item.tag === 'form') as
      | {
          name?: string;
          elements?: Array<Record<string, unknown>>;
        }
      | undefined;
    expect(form?.name).toBe('opencode_oauth_input');
    const inputs = (form?.elements ?? []).filter((item) => item.tag === 'input');
    expect(inputs.map((item) => item.name)).toEqual(['auth_input']);
    const submitButton = (form?.elements ?? []).find((item) => item.tag === 'button') as
      | { value?: Record<string, unknown> }
      | undefined;
    expect(submitButton?.value?.gateway_action).toBe('opencode_login.submit_auth_input');
    expect(submitButton?.value?.provider_id).toBe('openai');
  });
});

describe('formatCommandOutboundMessage', () => {
  it('keeps original session numbering in feishu session switch buttons', () => {
    const payload = formatCommandOutboundMessage(
      'feishu',
      '/sessions',
      [
        '会话列表（当前 agent，最近优先）：',
        '👉 1. 飞书富文本修改与路径确认 (019d...ea53) - 1. 有一些是我之前的修改',
        '   2. 确认对方是否还在线 (019d...7532) - 活着的吗？',
        '   12. OpenClaw使用流程调研 (019d...e6d3) - 给我调研一下 openclaw 的使用流程',
        '使用 /switch <编号> 切换会话。',
      ].join('\n'),
    );

    const buttons = extractButtons(getCardElements(payload));
    expect(buttons.some((item) => item.text?.content?.startsWith('1. '))).toBe(true);
    expect(buttons.some((item) => item.text?.content?.startsWith('2. '))).toBe(true);
    expect(buttons.some((item) => item.text?.content?.startsWith('12. '))).toBe(true);
    expect(buttons.some((item) => item.value?.gateway_cmd === '/switch 12' || item.value?.command === '/switch 12')).toBe(true);
  });

  it('keeps numbering in the current session field summary', () => {
    const payload = formatCommandOutboundMessage(
      'feishu',
      '/sessions',
      [
        '会话列表（当前 agent，最近优先）：',
        '👉 2. 确认对方是否还在线 (019d...7532) - 活着的吗？',
        '   12. OpenClaw使用流程调研 (019d...e6d3) - 给我调研一下 openclaw 的使用流程',
        '使用 /switch <编号> 切换会话。',
      ].join('\n'),
    );

    const markdown = JSON.stringify(getCardElements(payload));
    expect(markdown).toContain('**当前会话**\\n2. 确认对方是否还在线');
  });
});

describe('auth result and personal auth cards', () => {
  it('renders api login success as a conclusion-first card with a next step action', () => {
    const payload = buildFeishuApiLoginResultMessage({
      ok: true,
      baseUrl: 'https://codex.ai02.cn',
      model: 'gpt-5.3-codex',
      maskedApiKey: 'sk-***',
      message: '配置已写入并生效',
    });
    const elements = getCardElements(payload);
    const markdown = extractMarkdownContents(elements).join('\n');
    const buttons = extractButtons(elements);

    expect(markdown).toContain('**结论**');
    expect(markdown).toContain('配置已写入并生效');
    expect(markdown).toContain('**下一步**');
    expect(buttons.some((item) => item.text?.content === '重新登录')).toBe(true);
  });

  it('renders personal auth request as a guided card with one primary path', () => {
    const payload = buildFeishuUserAuthMessage({
      gatewayUserId: 'user_1',
    });
    const elements = getCardElements(payload);
    const markdown = extractMarkdownContents(elements).join('\n');
    const buttons = extractButtons(elements);

    expect(markdown).toContain('**步骤 1**');
    expect(markdown).toContain('授权个人任务与个人日历');
    expect(markdown).toContain('**下一步**');
    expect(buttons.some((item) => item.text?.content === '去飞书授权')).toBe(true);
    expect(buttons.some((item) => item.text?.content === '查看授权状态')).toBe(true);
  });

  it('renders unavailable personal auth as a diagnosis-first card', () => {
    const payload = buildFeishuPersonalAuthUnavailableMessage();
    const elements = getCardElements(payload);
    const markdown = extractMarkdownContents(elements).join('\n');

    expect(markdown).toContain('**当前状态**');
    expect(markdown).toContain('**下一步**');
    expect(markdown).toContain('不是 /login 问题');
  });
});

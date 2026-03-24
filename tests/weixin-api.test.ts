import { describe, expect, it } from 'vitest';

import { splitWeixinOutboundText } from '../src/services/weixin-api.js';

describe('splitWeixinOutboundText', () => {
  it('keeps a single message unchanged', () => {
    expect(splitWeixinOutboundText('默认助手 ·\n开始处理。')).toEqual([
      '默认助手 ·\n开始处理。',
    ]);
  });

  it('splits multiple message blocks by blank lines', () => {
    expect(splitWeixinOutboundText('第一条消息\n继续说明\n\n第二条消息\n\n第三条消息')).toEqual([
      '第一条消息\n继续说明',
      '第二条消息',
      '第三条消息',
    ]);
  });

  it('ignores surrounding blank lines and empty blocks', () => {
    expect(splitWeixinOutboundText('\n\n第一条消息\n\n\n第二条消息\n\n')).toEqual([
      '第一条消息',
      '第二条消息',
    ]);
  });
});

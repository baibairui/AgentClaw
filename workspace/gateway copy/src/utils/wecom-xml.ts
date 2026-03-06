import { parseStringPromise } from 'xml2js';

interface RawWeComMessage {
  ToUserName?: string;
  FromUserName?: string;
  MsgType?: string;
  Content?: string;
  MsgId?: string;
  Encrypt?: string;
}

export interface WeComIncomingMessage {
  toUserName: string;
  fromUserName: string;
  msgType: string;
  content: string;
  msgId?: string;
  /** 安全模式外层 XML 的 <Encrypt> 字段 */
  encrypt?: string;
}

export async function parseWeComXml(xml: string): Promise<WeComIncomingMessage> {
  const parsed = (await parseStringPromise(xml, {
    explicitArray: false,
    trim: true,
  })) as { xml?: RawWeComMessage };

  const body = parsed.xml ?? {};
  return {
    toUserName: body.ToUserName ?? '',
    fromUserName: body.FromUserName ?? '',
    msgType: body.MsgType ?? '',
    content: body.Content ?? '',
    msgId: body.MsgId,
    encrypt: body.Encrypt,
  };
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.module';
import { config } from '../../config';
export interface DispatchInput {
  topic: string;
  title: string;
  body: string;
  meta?: Record<string, any>;
}

const DEFAULT_EMAIL_TOPICS = [
  'CONTRACT_ACTIVATED', 'PAYMENT_CONFIRMED', 'CLAIM_STATUS', 'CLAIM_RECEIVED',
  'EXPIRY_REMINDER', 'CONTRACT_EXPIRED',
];
const DEFAULT_SMS_TOPICS = [
  'CONTRACT_ACTIVATED', 'PAYMENT_CONFIRMED', 'CONTRACT_SUSPENDED',
  'DUE_REMINDER', 'EXPIRY_REMINDER', 'THIRDPARTY_CONFIRMED',
];

function topicList(envValue: string, fallback: string[]): Set<string> {
  const v = (envValue || '').trim();
  if (!v) return new Set(fallback);
  if (v === 'none' || v === 'NONE') return new Set();
  return new Set(v.split(',').map(s => s.trim()).filter(Boolean));
}

@Injectable()
export class NotificationDispatchService {
  constructor(private prisma: PrismaService) {}

  async dispatchToUser(userId: string, input: DispatchInput) {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          topic: input.topic,
          title: input.title,
          body: input.body,
          channel: 'IN_APP',
          meta: input.meta ? JSON.stringify(input.meta) : null,
        },
      });
    } catch {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) return;

    const emailTopics = topicList(config.notifyEmailTopics, DEFAULT_EMAIL_TOPICS);
    const smsTopics = topicList(config.notifySmsTopics, DEFAULT_SMS_TOPICS);

    const jobs: Promise<unknown>[] = [];
    if (emailTopics.has(input.topic) && user.email) jobs.push(this.sendEmail(user.email, input));
    if (smsTopics.has(input.topic)) jobs.push(this.sendSmsOrWhatsapp(user.phone, input));
    await Promise.allSettled(jobs);
  }

  async dispatchToMany(userIds: string[], input: DispatchInput) {
    await Promise.allSettled(userIds.map(id => this.dispatchToUser(id, input)));
  }

  private async sendEmail(to: string, input: DispatchInput) {
    if (!config.emailApiUrl || !config.emailApiKey) {
      console.log(`[EMAILâ†’${to}] ${input.title} â€” ${input.body}`);
      return;
    }
    await this.postJson(config.emailApiUrl, {
      to,
      subject: `${input.title}`,
      text: input.body,
      sender: config.emailFrom,
    }, config.emailApiKey);
  }

  private async sendSmsOrWhatsapp(to: string | null | undefined, input: DispatchInput) {
    if (!to) return;
    if (config.waToken && config.waPhoneId) {
      await this.sendWhatsapp(to, input).catch(e => console.error('[WHATSAPP]', e?.message));
      return;
    }
    await this.sendSms(to, input);
  }

  private async sendSms(to: string, input: DispatchInput) {
    if (!config.smsApiUrl || !config.smsApiKey) {
      console.log(`[SMSâ†’${to}] ${input.title} â€” ${input.body}`);
      return;
    }
    await this.postJson(config.smsApiUrl, {
      to,
      message: `${input.title}\n${input.body}`.slice(0, 320),
      sender: config.smsSender,
    }, config.smsApiKey);
  }

  private async sendWhatsapp(to: string, input: DispatchInput) {
    const phone = to.replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneId}/messages`;
    await this.postJson(url, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: `${input.title}\n\n${input.body}`.slice(0, 1000) },
    }, config.waToken);
  }

  private async postJson(url: string, payload: unknown, bearer: string) {
    const fetchFn = (globalThis as any).fetch;
    if (!fetchFn) throw new Error('fetch indisponible');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${url.slice(0, 40)} â†’ HTTP ${res.status}`);
  }
}


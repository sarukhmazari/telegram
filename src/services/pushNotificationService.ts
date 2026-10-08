import { config } from '../config/index.js';
import { SettingService } from './settingService.js';
import { logger } from '../utils/logger.js';

export class PushNotificationService {
  public static readonly DEFAULT_TOPIC = 'King_of_Ai_Digital_Marketing';

  /**
   * Get active topic name (from database settings, environment, or default)
   */
  static async getTopic(): Promise<string> {
    const dbTopic = await SettingService.getSetting('ntfy_topic');
    if (dbTopic) return dbTopic.trim();
    return (config.NTFY_TOPIC || this.DEFAULT_TOPIC).trim();
  }

  /**
   * Send an instant high-priority push notification alert to phone via ntfy
   */
  static async sendPaymentAlert(data: {
    orderNumber: string;
    amount: number | string;
    customer: string;
    provider?: string;
    trxRef?: string;
    botUsername?: string;
  }): Promise<boolean> {
    try {
      const topic = await this.getTopic();
      if (!topic) return false;

      const title = `New Payment Received: Rs. ${data.amount} PKR`;
      const body =
        `📋 Order: #${data.orderNumber}\n` +
        `👤 Customer: ${data.customer}\n` +
        `💵 Amount: Rs. ${data.amount} PKR\n` +
        `💳 Method: ${data.provider || 'Manual Payment'}\n` +
        (data.trxRef ? `🔖 TRX Proof: ${data.trxRef}` : '');

      const headers: Record<string, string> = {
        'Title': title,
        'Priority': 'urgent',
        'Tags': 'moneybag,rotating_light,dollar',
      };

      if (data.botUsername) {
        headers['Actions'] = `view, Open Telegram Bot, https://t.me/${data.botUsername}`;
      }

      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers,
        body,
      });

      if (res.ok) {
        logger.info('Instant push notification sent to phone via ntfy', { topic, orderNumber: data.orderNumber });
        return true;
      } else {
        logger.warn('ntfy push notification returned non-ok status', { status: res.status });
        return false;
      }
    } catch (err: any) {
      logger.error('Error sending instant push notification', { error: err.message });
      return false;
    }
  }

  /**
   * Send a general critical alert
   */
  static async sendAlert(title: string, message: string, tags: string = 'bell'): Promise<boolean> {
    try {
      const topic = await this.getTopic();
      if (!topic) return false;

      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers: {
          'Title': title,
          'Priority': 'high',
          'Tags': tags,
        },
        body: message,
      });

      return res.ok;
    } catch (err: any) {
      logger.error('Error sending alert to ntfy', { error: err.message });
      return false;
    }
  }
}

import Dexie, { type Table } from 'dexie';

export interface PushNotification {
  id: string; // The UUID from the server/push payload
  title?: string;
  body: string;
  url?: string;
  priority: number;
  tags?: string;
  topic: string;
  created_at: number; // Unix timestamp in seconds
}

class WebPushDatabase extends Dexie {
  notifications!: Table<PushNotification, string>;

  constructor() {
    super('WebPushDatabase');
    this.version(1).stores({
      notifications: 'id, topic, created_at, priority',
    });
  }
}

export const db = new WebPushDatabase();

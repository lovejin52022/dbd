import { Notification } from 'electron';

/** 显示桌面通知（不支持时静默跳过） */
export function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

import type { ConnectedApplication, ProviderId } from '../types';

export interface Mailbox {
  id: string;
  displayName: string;
  providerId: ProviderId;
  status: 'draft' | 'connected';
  updatedAt: number;
}

export function toMailbox(application: ConnectedApplication): Mailbox {
  return {
    id: application.applicationId,
    displayName: application.displayName,
    providerId: application.providerId,
    status: application.status,
    updatedAt: application.updatedAt,
  };
}

export function fromMailbox(mailbox: Mailbox, application: ConnectedApplication): ConnectedApplication {
  return {
    ...application,
    displayName: mailbox.displayName,
  };
}

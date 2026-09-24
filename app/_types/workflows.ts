export type LocalWeather = {
  place: string;
  temperature: number;
  code: number;
  label: string;
  isDay: boolean;
  wind: number;
  high: number | null;
  low: number | null;
};

export type WorkflowEvent = {
  id: string;
  title: string;
  when: string;
  location: string;
  link: string;
};

export type WorkflowMail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type MailLimit = 5 | 10 | 20;

export type WorkflowBriefing = {
  connected: boolean;
  events: WorkflowEvent[];
  unread: number | null;
  mails: WorkflowMail[];
  eventsError: string | null;
  unreadError: string | null;
  mailsError: string | null;
  whatsappConnected: boolean;
  whatsappUnread: number | null;
  whatsappUnreadError: string | null;
};

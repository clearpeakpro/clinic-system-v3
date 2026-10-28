import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Envío por SMTP. En local apunta a Mailpit (docker compose). T-008 lo pasará
 * por el outbox; SES llega con el entorno B.
 */
export class SmtpMailer implements Mailer {
  readonly #transport;
  readonly #from: string;

  constructor(smtpUrl: string, from: string) {
    this.#transport = nodemailer.createTransport(smtpUrl);
    this.#from = from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.#transport.sendMail({ from: this.#from, ...message });
  }
}

/** Correo en memoria, para las pruebas. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

import nodemailer from 'nodemailer';

// Envío de correo del worker (T-008). En local, Mailpit; SES llegará con el
// entorno B. La API ya no envía correos: los escribe en el outbox.

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /** Id del evento del outbox: identifica un duplicado si el envío se repite. */
  messageId: string;
}

export interface Mailer {
  send(message: OutgoingMail): Promise<void>;
}

export class SmtpMailer implements Mailer {
  readonly #transport;
  readonly #from: string;
  readonly #domain: string;

  constructor(smtpUrl: string, from: string) {
    this.#transport = nodemailer.createTransport(smtpUrl);
    this.#from = from;
    this.#domain = /@([^>\s]+)/.exec(from)?.[1] ?? 'clinic-system.local';
  }

  async send(message: OutgoingMail): Promise<void> {
    await this.#transport.sendMail({
      from: this.#from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      messageId: `<${message.messageId}@${this.#domain}>`,
    });
  }
}

/** Correo en memoria, para las pruebas. */
export class MemoryMailer implements Mailer {
  readonly sent: OutgoingMail[] = [];
  send(message: OutgoingMail): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

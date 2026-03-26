import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'HTG <sesje@htgcyou.com>';
const REPLY_TO = 'htg@htg.cyou';

export async function sendOrderConfirmation(to: string, data: {
  name: string;
  productName: string;
  amount: number;
  currency: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Potwierdzenie zakupu — ${data.productName}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Dziękujemy za zakup!</h2>
          <p>Cześć ${data.name},</p>
          <p>Twój zakup został zrealizowany pomyślnie.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">${data.productName}</p>
            <p style="margin: 8px 0 0; font-size: 24px; color: #8B9E7C;">${(data.amount / 100).toFixed(0)} ${data.currency.toUpperCase()}</p>
          </div>
          <p>Materiały są dostępne w Twoim panelu:</p>
          <a href="https://htgcyou.com/pl/konto" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Moje konto</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>XX Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendBookingConfirmation(to: string, data: {
  name: string;
  sessionType: string;
  date: string;
  time: string;
  expiresAt: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Rezerwacja sesji — ${data.date} ${data.time}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Termin zarezerwowany!</h2>
          <p>Cześć ${data.name},</p>
          <p>Twoja sesja została zarezerwowana. Potwierdź ją w ciągu 24 godzin.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Typ:</strong> ${data.sessionType}</p>
            <p style="margin: 8px 0 0;"><strong>Data:</strong> ${data.date}</p>
            <p style="margin: 8px 0 0;"><strong>Godzina:</strong> ${data.time}</p>
            <p style="margin: 8px 0 0; color: #CC9544;"><strong>Potwierdź do:</strong> ${data.expiresAt}</p>
          </div>
          <a href="https://htgcyou.com/pl/konto/sesje-indywidualne" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Potwierdź rezerwację</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>XX Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendSessionReminder(to: string, data: {
  name: string;
  sessionType: string;
  date: string;
  time: string;
  joinUrl: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Przypomnienie — sesja jutro ${data.time}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Przypomnienie o sesji</h2>
          <p>Cześć ${data.name},</p>
          <p>Twoja sesja odbędzie się jutro.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>${data.sessionType}</strong></p>
            <p style="margin: 8px 0 0;">${data.date} o ${data.time}</p>
          </div>
          <a href="${data.joinUrl}" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Dołącz do sesji</a>
          <p style="margin-top: 16px; color: #666; font-size: 14px;">Przygotuj stabilne łącze, kamerę i mikrofon. Link aktywuje się 15 minut przed sesją.</p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>XX Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendEarlierSlotNotification(to: string, data: {
  name: string;
  newDate: string;
  newTime: string;
  sessionType: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Wcześniejszy termin dostępny — ${data.newDate}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Wcześniejszy termin!</h2>
          <p>Cześć ${data.name},</p>
          <p>Pojawił się wcześniejszy wolny termin dla Twojej sesji:</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>${data.sessionType}</strong></p>
            <p style="margin: 8px 0 0; font-size: 20px; color: #8B9E7C;">${data.newDate} o ${data.newTime}</p>
          </div>
          <p>Masz 24 godziny na potwierdzenie. Jeśli nie potwierdzisz, termin wróci do puli.</p>
          <a href="https://htgcyou.com/pl/konto/sesje-indywidualne" style="display: inline-block; background: #CC9544; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Sprawdź termin</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>XX Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendPaymentFailedNotification(to: string, data: {
  name: string;
  productName: string;
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: 'Problem z płatnością — HTG',
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #ef4444; margin-top: 0;">Problem z płatnością</h2>
          <p>Cześć ${data.name},</p>
          <p>Płatność za <strong>${data.productName}</strong> nie powiodła się.</p>
          <p>Sprawdź dane karty lub skontaktuj się z nami: htg@htg.cyou</p>
          <a href="https://htgcyou.com/pl/konto/subskrypcje" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Zarządzaj subskrypcją</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>XX Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

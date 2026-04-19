import { Resend } from 'resend';

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL = 'HTG <sesje@htgcyou.com>';
const REPLY_TO = 'htg@htg.cyou';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendOrderConfirmation(to: string, data: {
  name: string;
  productName: string;
  amount: number;
  currency: string;
}) {
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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
  return getResend().emails.send({
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

export async function sendGiftNotification(to: string, data: {
  recipientName: string;
  senderName: string;
  productName: string;
  message?: string;
  claimUrl: string;
}) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Masz prezent od ${data.senderName} — sesja HTG`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">🎁 Masz prezent!</h2>
          <p>Cześć ${data.recipientName},</p>
          <p><strong>${data.senderName}</strong> kupił(a) dla Ciebie sesję HTG.</p>
          ${data.message ? `<div style="background: white; border-left: 4px solid #CC9544; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><p style="margin: 0; font-style: italic; color: #444;">"${data.message}"</p></div>` : ''}
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #1a1a2e;">${data.productName}</p>
          </div>
          <p>Kliknij poniżej, aby odebrać sesję na swoje konto:</p>
          <a href="${data.claimUrl}" style="display: inline-block; background: #CC9544; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Odbierz sesję →</a>
          <p style="margin-top: 20px; color: #666; font-size: 13px;">Jeśli nie masz jeszcze konta HTG — link przeniesie Cię do rejestracji. Sesja zostanie automatycznie przypisana do Twojego konta po zalogowaniu.</p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(to: string, data: { name: string }) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: 'Witaj w HTG — Hacking The Game',
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Witaj, ${data.name}!</h2>
          <p>Cieszę się, że dołączasz do społeczności HTG.</p>
          <p>W swoim panelu znajdziesz wszystkie zakupione sesje, nagrania i harmonogram. Jeśli masz pytania — odpisz na tego maila lub napisz na <a href="mailto:htg@htg.cyou">htg@htg.cyou</a>.</p>
          <a href="https://htgcyou.com/pl/konto" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Przejdź do konta →</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendPaymentFailedNotification(to: string, data: {
  name: string;
  productName: string;
}) {
  return getResend().emails.send({
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

export async function sendInvitationEmail(to: string, data: {
  inviterName: string;
  personalMessage?: string;
  registerUrl: string;
}) {
  const name = escapeHtml(data.inviterName);
  const messageBlock = data.personalMessage
    ? `<div style="background: white; border-left: 4px solid #CC9544; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><p style="margin: 0; font-style: italic; color: #444;">&bdquo;${escapeHtml(data.personalMessage)}&rdquo;</p></div>`
    : '';

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `${data.inviterName} zaprasza Cię do HTG`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Zaproszenie do HTG</h2>
          <p><strong>${name}</strong> zaprasza Cię do społeczności HTG — Hacking The Game.</p>
          <p>HTG to przestrzeń rozwoju osobistego i duchowego, prowadzona przez Natalię. Dołącz, aby uzyskać dostęp do sesji grupowych, nagrań i społeczności.</p>
          ${messageBlock}
          <a href="${escapeHtml(data.registerUrl)}" style="display: inline-block; background: #8B9E7C; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Dołącz do HTG →</a>
          <p style="margin-top: 20px; color: #666; font-size: 13px;">Kliknij powyżej, aby utworzyć konto. Rejestracja jest bezpłatna.</p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendTranslatorBookingNotification(to: string, data: {
  translatorName: string;
  clientName: string;
  sessionType: string;
  date: string;
  time: string;
}) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Nowa sesja zarezerwowana — ${data.date} ${data.time}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Nowa sesja z t\u0142umaczeniem</h2>
          <p>Cze\u015b\u0107 ${escapeHtml(data.translatorName)},</p>
          <p>Klient zarezerwowa\u0142 sesj\u0119 wymagaj\u0105c\u0105 t\u0142umaczenia. B\u0119dziesz potrzebny/a na tej sesji.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Klient:</strong> ${escapeHtml(data.clientName)}</p>
            <p style="margin: 8px 0 0;"><strong>Typ sesji:</strong> ${escapeHtml(data.sessionType)}</p>
            <p style="margin: 8px 0 0;"><strong>Data:</strong> ${escapeHtml(data.date)}</p>
            <p style="margin: 8px 0 0;"><strong>Godzina:</strong> ${escapeHtml(data.time)}</p>
          </div>
          <p style="color: #666; font-size: 14px;">Sesja pojawi si\u0119 w Twoim grafiku. Je\u015bli masz pytania \u2014 odpowiedz na tego maila.</p>
          <a href="https://htgcyou.com/pl/tlumacz/grafik" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Tw\u00f3j grafik \u2192</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendAssistantBookingNotification(to: string, data: {
  assistantName: string;
  clientName: string;
  sessionType: string;
  date: string;
  time: string;
  pendingPayment?: boolean;
}) {
  const statusNote = data.pendingPayment
    ? '<p style="color: #CC9544; font-size: 14px;">Uwaga: sesja oczekuje na weryfikację przelewu przez admina.</p>'
    : '<p style="color: #666; font-size: 14px;">Sesja pojawi się w Twoim grafiku. Jeśli masz pytania — odpowiedz na tego maila.</p>';

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: `Nowa sesja z Twoją asystą — ${data.date} ${data.time}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Nowa sesja z asyst\u0105</h2>
          <p>Cze\u015b\u0107 ${escapeHtml(data.assistantName)},</p>
          <p>Klient zarezerwowa\u0142 sesj\u0119 wymagaj\u0105c\u0105 Twojej asysty.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Klient:</strong> ${escapeHtml(data.clientName)}</p>
            <p style="margin: 8px 0 0;"><strong>Typ sesji:</strong> ${escapeHtml(data.sessionType)}</p>
            <p style="margin: 8px 0 0;"><strong>Data:</strong> ${escapeHtml(data.date)}</p>
            <p style="margin: 8px 0 0;"><strong>Godzina:</strong> ${escapeHtml(data.time)}</p>
          </div>
          ${statusNote}
          <a href="https://htgcyou.com/pl/operator/sesje" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Tw\u00f3j grafik \u2192</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendNewQuestionNotification(to: string | string[], data: {
  authorName: string;
  authorEmail: string;
  questionTitle: string;
  questionBody: string | null;
  adminUrl: string;
}) {
  const recipients = Array.isArray(to) ? to : [to];
  return getResend().emails.send({
    from: FROM_EMAIL,
    to: recipients,
    replyTo: REPLY_TO,
    subject: `Nowe pytanie do sesji — ${data.questionTitle.slice(0, 60)}`,
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Pytania do sesji badawczych</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Nowe pytanie oczekuje moderacji</h2>
          <p><strong>${escapeHtml(data.authorName)}</strong> (${escapeHtml(data.authorEmail)}) zadał/a pytanie:</p>
          <div style="background: white; border-left: 4px solid #8B9E7C; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-weight: bold; color: #1a1a2e;">${escapeHtml(data.questionTitle)}</p>
            ${data.questionBody ? `<p style="margin: 8px 0 0; color: #444; font-size: 14px;">${escapeHtml(data.questionBody)}</p>` : ''}
          </div>
          <a href="${escapeHtml(data.adminUrl)}" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Przejdź do panelu Pytań →
          </a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

export async function sendInvitationAccepted(to: string, data: {
  inviterName: string;
  newUserName: string;
  newUserEmail: string;
}) {
  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    replyTo: REPLY_TO,
    subject: 'Twoje zaproszenie zadziałało!',
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0; font-size: 28px;">HTG</h1>
          <p style="color: #a0a0b0; margin: 8px 0 0;">Hacking The Game</p>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Ktoś dołączył z Twojego zaproszenia!</h2>
          <p>Cześć ${escapeHtml(data.inviterName)},</p>
          <p><strong>${escapeHtml(data.newUserName)}</strong> (${escapeHtml(data.newUserEmail)}) właśnie dołączył/a do HTG z Twojego zaproszenia.</p>
          <p>Możesz dodać tę osobę do swoich znajomych:</p>
          <a href="https://htgcyou.com/pl/konto/polubieni" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Zobacz znajomych →</a>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>HTG Operator PSA | htg@htg.cyou</p>
        </div>
      </div>
    `,
  });
}

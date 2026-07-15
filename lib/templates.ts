import { formatEventDate } from "./cadence";

export interface EmailContent {
  subject: string;
  html: string;
}

function wrap(bodyHtml: string): string {
  return `<div style="font-family: sans-serif; line-height: 1.5; color: #1c261e;">${bodyHtml}</div>`;
}

export function initialInviteEmail(params: { name: string; rsvpLink: string; fee: number }): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `You're invited: ${eventDate} Golf Tournament`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>You're invited to this year's golf tournament on <strong>${eventDate}</strong>! Whether you're playing golf or just joining us for the reception afterward, we'd love to have you.</p>
      <p><strong>RSVP here:</strong> <a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
      <p>On the RSVP page, just tell us how many people from your household are golfing and how many are coming to the reception — golf is $${params.fee} per golfer, the reception is free.</p>
      <ul>
        <li>Golfing and going to the reception? Count them in both.</li>
        <li>Just coming to celebrate afterward? Count them in reception only.</li>
        <li>Nobody able to make it? Enter 0 for both so we can plan headcount.</li>
      </ul>
      <p>Please RSVP if you can — see you on the course!</p>
    `),
  };
}

export function reminderFirstEmail(params: { name: string; rsvpLink: string }): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `Still time to RSVP: ${eventDate} Golf Tournament`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>Quick reminder — we haven't heard back yet on the golf tournament on ${eventDate}. Let us know how many are golfing and how many are coming to the reception (0 is fine for either):</p>
      <p><a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
      <p>Takes 30 seconds.</p>
    `),
  };
}

export function reminderSecondEmail(params: { name: string; rsvpLink: string }): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `RSVP reminder: ${eventDate} Golf Tournament`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>Following up again on the golf tournament — ${eventDate} is getting closer and we're finalizing headcount and tee times. Can you RSVP when you get a chance?</p>
      <p><a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
    `),
  };
}

export function reminderOngoingEmail(params: { name: string; rsvpLink: string }): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `RSVP reminder: ${eventDate} Golf Tournament`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>The golf tournament is coming up on ${eventDate} — we still need your RSVP to finalize the details. One click:</p>
      <p><a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
      <p>If you're not able to make it this year, that's totally fine too — just let us know so we can plan around it.</p>
    `),
  };
}

export function reminderFinalCallEmail(params: { name: string; rsvpLink: string }): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `Last call: RSVP for ${eventDate} — this week!`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>The golf tournament is just days away (${eventDate}) and we still haven't heard from you. We need to lock in headcount very soon — can you RSVP today?</p>
      <p><a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
      <p>If you can't make it, no worries at all — just let us know so we can finalize plans.</p>
    `),
  };
}

export function confirmationPaidEmail(params: {
  name: string;
  golferCount: number;
  receptionCount: number;
}): EmailContent {
  const eventDate = formatEventDate();
  return {
    subject: `You're confirmed: ${params.golferCount} golfer(s) + ${params.receptionCount} at the reception, ${eventDate} (paid)`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>You're fully confirmed and paid up — ${params.golferCount} golfing, ${params.receptionCount} total at the reception — for ${eventDate}! PayPal will also send you a separate payment receipt for your records.</p>
      <p>See you on the course! Questions? Just reply to this email.</p>
    `),
  };
}

export function confirmationFreeEmail(params: {
  name: string;
  rsvpLink: string;
  receptionCount: number;
}): EmailContent {
  const eventDate = formatEventDate();
  const body =
    params.receptionCount > 0
      ? "You're on the list for the reception — no payment needed, just show up."
      : "You're marked as not attending this year.";
  return {
    subject: `You're confirmed for ${eventDate}`,
    html: wrap(`
      <p>Hi ${params.name},</p>
      <p>Thanks for letting us know! ${body} If your plans change, just use your link again:</p>
      <p><a href="${params.rsvpLink}">${params.rsvpLink}</a></p>
    `),
  };
}

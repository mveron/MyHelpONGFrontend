import type { Config, Context } from "@netlify/functions";

type ContactPayload = {
  name?: string;
  email?: string;
  organization?: string;
  message?: string;
  botField?: string;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const normalizeString = (value: unknown) => String(value ?? "").trim();

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload: ContactPayload;
  try {
    payload = (await req.json()) as ContactPayload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const botField = normalizeString(payload.botField);
  if (botField) {
    return jsonResponse({ ok: true });
  }

  const name = normalizeString(payload.name);
  const email = normalizeString(payload.email);
  const organization = normalizeString(payload.organization);
  const message = normalizeString(payload.message);

  if (!name || !email || !organization || !message) {
    return jsonResponse(
      { ok: false, error: "Missing required contact fields" },
      400
    );
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: "Invalid email format" }, 400);
  }

  const resendApiKey = Netlify.env.get("RESEND_API_KEY");
  const toEmail =
    Netlify.env.get("CONTACT_TO_EMAIL") ?? Netlify.env.get("RESEND_TO_EMAIL");
  const fromEmail =
    Netlify.env.get("RESEND_FROM_EMAIL") ?? "MyHelp ONG <onboarding@resend.dev>";

  if (!resendApiKey || !toEmail) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Missing environment variables. Configure RESEND_API_KEY and CONTACT_TO_EMAIL.",
      },
      500
    );
  }

  const subject = `Nuevo contacto MyHelp ONG - ${organization}`;
  const text = [
    "Nuevo mensaje de contacto",
    `Nombre: ${name}`,
    `Email: ${email}`,
    `Organizacion: ${organization}`,
    "",
    "Mensaje:",
    message,
  ].join("\n");

  const html = `
    <h2>Nuevo mensaje de contacto</h2>
    <p><strong>Nombre:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Organizacion:</strong> ${organization}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${message.replace(/\n/g, "<br/>")}</p>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: email,
      subject,
      text,
      html,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse(
      {
        ok: false,
        error: "Resend request failed",
        details: errorText,
      },
      502
    );
  }

  return jsonResponse({ ok: true });
};

export const config: Config = {
  path: "/api/contact",
};

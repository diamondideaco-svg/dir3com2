export type SupportedLanguage = "ar" | "en";

export type SocialChannel = "whatsapp" | "instagram" | "tiktok" | "x" | "facebook" | "linkedin";

export type SocialLink = {
  channel: SocialChannel;
  label: string;
  href: string;
};

export type WhatsAppCountry = "eg" | "sa";

type SocialEnv = {
  instagram?: string;
  tiktok?: string;
  x?: string;
  facebook?: string;
  linkedin?: string;
  whatsappEg?: string;
  whatsappSa?: string;
};

const GENERIC_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "www.x.com",
  "facebook.com",
  "www.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
]);

function normalizeUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return null;
    }

    if (GENERIC_HOSTS.has(url.hostname) && (url.pathname === "/" || !url.pathname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizePhone(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

function buildWhatsAppUrl(phone: string | null) {
  if (!phone) {
    return null;
  }

  return `https://wa.me/${phone}`;
}

function readSocialEnv(): SocialEnv {
  return {
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL,
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_URL,
    x: process.env.NEXT_PUBLIC_SOCIAL_X_URL,
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK_URL,
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL,
    whatsappEg: process.env.NEXT_PUBLIC_WHATSAPP_EG_PHONE,
    whatsappSa: process.env.NEXT_PUBLIC_WHATSAPP_SA_PHONE,
  };
}

export function getWhatsAppDirectory(): Record<WhatsAppCountry, string | null> {
  const env = readSocialEnv();
  const egPhone = normalizePhone(env.whatsappEg);
  const saPhone = normalizePhone(env.whatsappSa) ?? "966532867009";

  return {
    eg: buildWhatsAppUrl(egPhone),
    sa: buildWhatsAppUrl(saPhone),
  };
}

export function getOfficialSocialLinks(language: SupportedLanguage): SocialLink[] {
  const env = readSocialEnv();
  const labels: Record<SocialChannel, string> = {
    whatsapp: language === "ar" ? "واتساب" : "WhatsApp",
    instagram: "Instagram",
    tiktok: "TikTok",
    x: "X",
    facebook: "Facebook",
    linkedin: "LinkedIn",
  };

  const whatsapp = getWhatsAppDirectory();
  const candidates: Array<SocialLink | null> = [
    whatsapp.sa ? { channel: "whatsapp", label: labels.whatsapp, href: whatsapp.sa } : null,
    normalizeUrl(env.instagram) ? { channel: "instagram", label: labels.instagram, href: normalizeUrl(env.instagram) as string } : null,
    normalizeUrl(env.tiktok) ? { channel: "tiktok", label: labels.tiktok, href: normalizeUrl(env.tiktok) as string } : null,
    normalizeUrl(env.x) ? { channel: "x", label: labels.x, href: normalizeUrl(env.x) as string } : null,
    normalizeUrl(env.facebook) ? { channel: "facebook", label: labels.facebook, href: normalizeUrl(env.facebook) as string } : null,
    normalizeUrl(env.linkedin) ? { channel: "linkedin", label: labels.linkedin, href: normalizeUrl(env.linkedin) as string } : null,
  ];

  return candidates.filter((entry): entry is SocialLink => entry !== null);
}
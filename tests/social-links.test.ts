import assert from "node:assert/strict";
import test from "node:test";
import { getOfficialSocialLinks, getWhatsAppDirectory } from "@/lib/config/social";

test("social links hide generic placeholders", () => {
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL = "https://instagram.com";
  process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_URL = "https://tiktok.com";
  process.env.NEXT_PUBLIC_SOCIAL_X_URL = "https://x.com";
  process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK_URL = "https://facebook.com";
  process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL = "https://linkedin.com";

  const links = getOfficialSocialLinks("en");
  const labels = links.map((link) => link.label);
  assert.equal(labels.includes("Instagram"), false);
  assert.equal(labels.includes("LinkedIn"), false);
});

test("social links include configured official channels and LinkedIn", () => {
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL = "https://instagram.com/dir3com";
  process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL = "https://www.linkedin.com/company/dir3com";

  const links = getOfficialSocialLinks("en");
  assert.equal(links.some((link) => link.label === "Instagram"), true);
  assert.equal(links.some((link) => link.label === "LinkedIn"), true);
});

test("whatsapp directory supports Egypt and Saudi config", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_EG_PHONE = "+201011676418";
  process.env.NEXT_PUBLIC_WHATSAPP_SA_PHONE = "+966532867009";

  const directory = getWhatsAppDirectory();
  assert.equal(directory.eg, "https://wa.me/201011676418");
  assert.equal(directory.sa, "https://wa.me/966532867009");
});

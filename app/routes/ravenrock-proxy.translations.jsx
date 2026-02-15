import { json } from "@remix-run/node";
import en from "../../extensions/ravenrock-upsell-widget/locales/en.default.json";
import nl from "../../extensions/ravenrock-upsell-widget/locales/nl.json";

const widgetTranslations = { en, nl };

export async function loader({ request }) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") || "en";
  
  // Normaliseer locale
  const normalizedLocale = locale.toLowerCase().split('-')[0];
  
  return json(widgetTranslations[normalizedLocale] || widgetTranslations.en);
}

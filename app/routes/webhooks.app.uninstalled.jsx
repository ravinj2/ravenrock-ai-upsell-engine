import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[Webhook] topic=${topic} shop=${shop}`);

  // Let op: bij uninstall kan session ontbreken, maar shop is genoeg voor DB cleanup.
  if (!shop) return new Response("ok", { status: 200 });

  switch (topic) {
    case "APP_UNINSTALLED":
    case "SHOP_REDACT":
      // Shop-level cleanup
      await db.session.deleteMany({ where: { shop } });
      await db.upsellSettings.deleteMany({ where: { shop } });
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // MVP: als je geen customer data opslaat, is "200 OK" genoeg.
      // Later: hier export/delete je customer data die jij opslaat.
      break;

    default:
      break;
  }

  // Shopify wil 200 OK, anders gaan ze retries doen
  return new Response("ok", { status: 200 });
};

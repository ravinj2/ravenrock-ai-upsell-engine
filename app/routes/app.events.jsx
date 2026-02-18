import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Page, Card, DataTable, Text, BlockStack, InlineStack, Badge } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const events = await db.widgetEvent.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return json({ shop: session.shop, events });
};

function typeTone(type) {
  if (type === "rr_add_to_cart") return "success";
  if (type === "rr_fetch_error") return "critical";
  if (type === "rr_widget_open") return "info";
  if (type === "rr_upsells_shown") return "attention";
  return "subdued";
}

export default function AppEvents() {
  const { shop, events } = useLoaderData();

  const rows = (events || []).map((e) => [
    new Date(e.createdAt).toLocaleString(),
    <Badge key={e.id} tone={typeTone(e.type)}>{e.type}</Badge>,
    e.productHandle || "—",
    e.currentVariant || "—",
    e.upsellVariant || "—",
    typeof e.count === "number" ? String(e.count) : "—",
    e.trigger || "—",
    e.analyticsAllowed === true ? "yes" : (e.analyticsAllowed === false ? "no" : "—"),
  ]);

  return (
    <Page title="RavenRock Events">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack gap="200" align="space-between">
              <Text as="p" variant="bodyMd">
                Shop: <strong>{shop}</strong>
              </Text>
              <Text as="p" variant="bodyMd">
                Latest {rows.length} events
              </Text>
            </InlineStack>

            <DataTable
              columnContentTypes={["text","text","text","text","text","text","text","text"]}
              headings={["Time","Type","Handle","Current variant","Upsell variant","Count","Trigger","Analytics allowed"]}
              rows={rows}
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

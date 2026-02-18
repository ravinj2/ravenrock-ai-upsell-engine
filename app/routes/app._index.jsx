import { useEffect } from "react";
import { useFetcher, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const color = ["Red", "Orange", "Yellow", "Green"][Math.floor(Math.random() * 4)];

  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    { variables: { product: { title: `${color} Snowboard` } } }
  );

  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;

  const variantResponse = await admin.graphql(
    `#graphql
      mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    }
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isLoading =
    (fetcher.state === "loading" || fetcher.state === "submitting") &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page
      title="RavenRock AI Upsell Engine"
      primaryAction={{
        content: "Generate a product",
        onAction: generateProduct,
        loading: isLoading,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Congrats on creating a new Shopify app 🎉
                </Text>
                <Text as="p" variant="bodyMd">
                  This embedded app uses App Bridge and Admin GraphQL as a starting point for development.
                </Text>
                <Text as="p" variant="bodyMd">
                  Open{" "}
                  <Link to="/app/events" style={{ textDecoration: "underline" }}>
                    Events
                  </Link>{" "}
                  to see RavenRock widget telemetry once events are logged.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Get started with products
                </Text>

                <InlineStack gap="200">
                  <Button variant="primary" onClick={generateProduct} loading={isLoading}>
                    Generate a product
                  </Button>

                  {fetcher.data?.product?.id && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        shopify.intents.invoke?.("edit:shopify/Product", {
                          value: fetcher.data?.product?.id,
                        });
                      }}
                    >
                      Edit product
                    </Button>
                  )}
                </InlineStack>

                {fetcher.data?.product && (
                  <div
                    style={{
                      border: "1px solid #e1e3e5",
                      borderRadius: 8,
                      padding: 12,
                      background: "#f6f6f7",
                      overflowX: "auto",
                    }}
                  >
                    <pre style={{ margin: 0 }}>
                      <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                    </pre>
                  </div>
                )}

                {fetcher.data?.variant && (
                  <div
                    style={{
                      border: "1px solid #e1e3e5",
                      borderRadius: 8,
                      padding: 12,
                      background: "#f6f6f7",
                      overflowX: "auto",
                    }}
                  >
                    <pre style={{ margin: 0 }}>
                      <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                    </pre>
                  </div>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

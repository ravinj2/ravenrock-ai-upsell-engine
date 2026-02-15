import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const GET_PRODUCTS_WITH_VARIANTS = `
  query getProductsWithVariants($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          featuredImage {
            url
            altText
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                displayName
                price
                inventoryQuantity
                image {
                  url
                  altText
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  const { query } = await request.json();
  
  const response = await admin.graphql(GET_PRODUCTS_WITH_VARIANTS, {
    variables: {
      first: 20,
      query: query || null,
    },
  });

  const data = await response.json();
  
  // Transform data voor makkelijker gebruik
  const products = data.data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    featuredImage: node.featuredImage,
    variants: node.variants.edges.map(({ node: variant }) => ({
      id: variant.id,
      title: variant.title,
      displayName: variant.displayName,
      price: variant.price,
      inventoryQuantity: variant.inventoryQuantity,
      image: variant.image,
      selectedOptions: variant.selectedOptions,
    })),
  }));

  return json({ products });
};

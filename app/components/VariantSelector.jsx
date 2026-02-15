import { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  TextField,
  Thumbnail,
  Text,
  InlineStack,
  BlockStack,
  Spinner,
  EmptyState,
  Icon,
} from '@shopify/polaris';
import { ImageIcon, CheckIcon } from '@shopify/polaris-icons';

export function VariantSelector({ open, onClose, onSelect, shopify, preSelectedIds = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState([]);

  const fetchProducts = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const response = await fetch('/app/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((value) => {
    setSearchQuery(value);
    fetchProducts(value);
  }, [fetchProducts]);

  const toggleVariant = useCallback((variantId) => {
    setSelectedVariants((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId]
    );
  }, []);

  const handleConfirm = useCallback(() => {
    onSelect(selectedVariants);
    setSelectedVariants([]);
    setSearchQuery('');
    setProducts([]);
    onClose();
  }, [selectedVariants, onSelect, onClose]);

  // Load products when modal opens
  useEffect(() => {
    if (open) {
      fetchProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Set pre-selected variants
  useEffect(() => {
    if (open && preSelectedIds.length > 0) {
      setSelectedVariants(preSelectedIds);
    }
  }, [open, preSelectedIds]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select variants"
      primaryAction={{
        content: `Add ${selectedVariants.length} variant${selectedVariants.length !== 1 ? 's' : ''}`,
        onAction: handleConfirm,
        disabled: selectedVariants.length === 0,
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            placeholder="Search products..."
            value={searchQuery}
            onChange={handleSearch}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => handleSearch('')}
          />

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spinner size="large" />
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              heading="No products found"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Try adjusting your search</p>
            </EmptyState>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {products.map((product) => (
                <BlockStack key={product.id} gap="200">
                  <Text variant="headingMd" as="h3">
                    {product.title}
                  </Text>
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariants.includes(variant.id);
                    return (
                      <div
                        key={variant.id}
                        onClick={() => toggleVariant(variant.id)}
                        style={{
                          padding: '12px',
                          border: isSelected ? '2px solid #008060' : '1px solid #e1e3e5',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#f4f6f8' : 'white',
                          position: 'relative',
                        }}
                      >
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                            <Icon source={CheckIcon} tone="success" />
                          </div>
                        )}
                        <InlineStack gap="300" align="start">
                          <Thumbnail
                            source={variant.image?.url || product.featuredImage?.url || ImageIcon}
                            alt={variant.image?.altText || product.title}
                            size="small"
                          />
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="semibold">
                              {variant.displayName}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              {variant.selectedOptions.map(opt => `${opt.name}: ${opt.value}`).join(' • ')}
                            </Text>
                            <InlineStack gap="200">
                              <Text variant="bodySm">${variant.price}</Text>
                              <Text variant="bodySm" tone={variant.inventoryQuantity > 0 ? 'success' : 'critical'}>
                                {variant.inventoryQuantity > 0 
                                  ? `${variant.inventoryQuantity} available`
                                  : 'Out of stock'}
                              </Text>
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>
                      </div>
                    );
                  })}
                </BlockStack>
              ))}
            </div>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
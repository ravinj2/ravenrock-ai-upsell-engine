import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  FormLayout,
  Select,
  TextField,
  Checkbox,
  Button,
  ButtonGroup,
  Text,
  Box,
  CalloutCard,
  Banner,
} from '@shopify/polaris';
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { useCallback, useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import db from "../db.server";
import { VariantSelector } from "../components/VariantSelector";
import { translations, getTranslation } from "../translations";


export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Detecteer admin locale (voor settings pagina) en shop locale (voor widget)
  const adminLocale = session?.locale || "en";
  const shopLocale = session?.locale || "en";
  
  let settings = await db.settings.findFirst({
    where: { shop: session.shop }
  });
  
  if (!settings) {
    settings = await db.settings.create({
      data: {
        shop: session.shop,
        upsellMode: "collection",
        manualVariantIds: "",
        fallbackVariantIds: "",
        limit: 3,
        excludeGiftCards: false,
        excludeOutOfStock: false,
        redirectToCart: true,
        aiEnabled: false,
        aiMonthlyLimit: 1000,
        aiCallsThisMonth: 0,
        aiFallbackMode: "collection",
        aiMessageText: "Based on your browsing, we think you'll love these",
        fallbackMessageText: "You might also like",
        widgetLocale: null,
      }
    });
  }
  
  return json({ settings, shopLocale, adminLocale });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const widgetLocaleValue = formData.get("widgetLocale");
  
  const settingsData = {
    upsellMode: formData.get("upsellMode"),
    manualVariantIds: formData.get("manualVariantIds") || "",
    fallbackVariantIds: formData.get("fallbackVariantIds") || "",
    limit: Number(formData.get("limit")),
    excludeGiftCards: formData.get("excludeGiftCards") === "true", 
    excludeOutOfStock: formData.get("excludeOutOfStock") === "true",  
    redirectToCart: formData.get("redirectToCart") === "true",
    aiEnabled: formData.get("aiEnabled") === "true",
    aiMonthlyLimit: Number(formData.get("aiMonthlyLimit")),
    aiFallbackMode: formData.get("aiFallbackMode") || "collection",
    aiMessageText: formData.get("aiMessageText") || "",
    fallbackMessageText: formData.get("fallbackMessageText") || "",
    widgetLocale: widgetLocaleValue === "auto" ? null : widgetLocaleValue,
  };
  
  await db.settings.upsert({
    where: { shop: session.shop },
    update: settingsData,
    create: { shop: session.shop, ...settingsData }
  });
  
  return json({ success: true });
};

export default function SettingsPage() {
  const { settings, shopLocale, adminLocale } = useLoaderData();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  
  // Helper functie voor vertalingen
  const t = (key) => getTranslation(adminLocale, `settings.${key}`);
  
  const [upsellMode, setUpsellMode] = useState(settings.upsellMode || "collection");
  const [manualVariantIds, setManualVariantIds] = useState(settings.manualVariantIds || "");
  const [fallbackVariantIds, setFallbackVariantIds] = useState(settings.fallbackVariantIds || "");
  const [limit, setLimit] = useState(Number(settings.limit || 3));
  const [excludeGiftCards, setExcludeGiftCards] = useState(!!settings.excludeGiftCards);
  const [excludeOutOfStock, setExcludeOutOfStock] = useState(!!settings.excludeOutOfStock);
  const [redirectToCart, setRedirectToCart] = useState(settings.redirectToCart !== false);
  const [aiEnabled, setAiEnabled] = useState(!!settings.aiEnabled);
  const [aiMonthlyLimit, setAiMonthlyLimit] = useState(settings.aiMonthlyLimit || 1000);
  const [aiFallbackMode, setAiFallbackMode] = useState(settings.aiFallbackMode || "collection");
  const [aiMessageText, setAiMessageText] = useState(settings.aiMessageText || "Based on your browsing, we think you'll love these");
  const [fallbackMessageText, setFallbackMessageText] = useState(settings.fallbackMessageText || "You might also like");
  const [widgetLocale, setWidgetLocale] = useState(settings.widgetLocale || "auto");
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [currentSetter, setCurrentSetter] = useState(null);

  const localeOptions = [
    { label: `${t('autoShopLanguage')} ${shopLocale.toUpperCase()})`, value: "auto" },
    { label: "English", value: "en" },
    { label: "Nederlands", value: "nl" },
    { label: "Deutsch", value: "de" },
    { label: "Français", value: "fr" },
    { label: "Español", value: "es" },
    { label: "Italiano", value: "it" },
    { label: "Português (BR)", value: "pt-BR" },
    { label: "Português (PT)", value: "pt-PT" },
    { label: "日本語", value: "ja" },
    { label: "简体中文", value: "zh-CN" },
    { label: "繁體中文", value: "zh-TW" },
    { label: "한국어", value: "ko" },
    { label: "Dansk", value: "da" },
    { label: "Suomi", value: "fi" },
    { label: "Norsk (Bokmål)", value: "nb" },
    { label: "Svenska", value: "sv" },
    { label: "Čeština", value: "cs" },
    { label: "Polski", value: "pl" },
    { label: "ไทย", value: "th" },
    { label: "Türkçe", value: "tr" },
    { label: "हिन्दी", value: "hi" },
  ];

  function toCsv(ids) {
    const uniq = Array.from(new Set(ids.map(String).map((s) => s.trim()).filter(Boolean)));
    return uniq.join(",");
  }

  function extractNumericId(maybeGid) {
    const s = String(maybeGid || "");
    const last = s.split("/").pop() || "";
    return last.replace(/\D/g, "");
  }

  function countCsv(csv) {
    return String(csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length;
  }

  function openVariantSelector(setter) {
    setCurrentSetter(() => setter);
    setVariantSelectorOpen(true);
  }

  function handleVariantSelect(variantIds) {
    if (currentSetter && variantIds.length > 0) {
      const numericIds = variantIds.map(id => extractNumericId(id));
      currentSetter(toCsv(numericIds));
    }
  }

  return (
    <Page 
      title={t('pageTitle')}
      narrowWidth
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              {t('pageDescription')}
            </Text>
          </BlockStack>
        </Card>

        <Form method="post">
          <BlockStack gap="500">
            {/* Upsell Selection */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('upsellSelection')}</Text>

                <Select
                  label={t('upsellMode')}
                  name="upsellMode"
                  options={[
                    { label: t('upsellModeCollection'), value: "collection" },
                    { label: t('upsellModeManual'), value: "manual" },
                  ]}
                  value={upsellMode}
                  onChange={(value) => setUpsellMode(value)}
                  helpText={
                    upsellMode === "collection"
                      ? t('upsellModeCollectionHelp')
                      : t('upsellModeManualHelp')
                  }
                />

                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <TextField
                      label={t('manualVariantIds')}
                      name="manualVariantIds"
                      value={manualVariantIds}
                      onChange={setManualVariantIds}
                      multiline={2}
                      autoComplete="off"
                      helpText={`${countCsv(manualVariantIds)} ${t('manualVariantIdsHelp')}`}
                      disabled={upsellMode !== "manual"}
                      readOnly
                    />
                    <InlineStack gap="200">
                      <Button 
                        onClick={() => openVariantSelector(setManualVariantIds)}
                        disabled={upsellMode !== "manual"}
                      >
                        {t('pickVariants')}
                      </Button>
                      <Button 
                        tone="critical" 
                        onClick={() => setManualVariantIds("")}
                        disabled={!manualVariantIds}
                      >
                        {t('clear')}
                      </Button>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack gap="200">
                    <TextField
                      label={t('fallbackVariantIds')}
                      name="fallbackVariantIds"
                      value={fallbackVariantIds}
                      onChange={setFallbackVariantIds}
                      multiline={2}
                      autoComplete="off"
                      helpText={`${countCsv(fallbackVariantIds)} ${t('fallbackVariantIdsHelp')}`}
                      readOnly
                    />
                    <InlineStack gap="200">
                      <Button 
                        onClick={() => openVariantSelector(setFallbackVariantIds)}
                        disabled={upsellMode !== "manual"}
                      >
                        {t('pickVariants')}
                      </Button>
                      <Button 
                        tone="critical" 
                        onClick={() => setFallbackVariantIds("")} 
                        disabled={!fallbackVariantIds}
                      >
                        {t('clear')}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* AI Recommendations */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('aiRecommendations')}</Text>
                
                <input 
                  type="hidden" 
                  name="aiEnabled" 
                  value={aiEnabled ? "true" : "false"} 
                />
                <Checkbox
                  label={t('aiEnable')}
                  checked={aiEnabled}
                  onChange={setAiEnabled}
                  helpText={t('aiEnableHelp')}
                />
                
                {aiEnabled && (
                  <BlockStack gap="400">
                    <Box 
                      padding="400" 
                      background="bg-surface-secondary" 
                      borderRadius="200"
                    >
                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {t('aiCallsUsed')} <Text as="span" fontWeight="semibold">{settings.aiCallsThisMonth || 0}</Text> / {aiMonthlyLimit}
                        </Text>
                        <div style={{ 
                          width: '100%', 
                          height: '8px', 
                          background: '#e0e0e0', 
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${Math.min(((settings.aiCallsThisMonth || 0) / aiMonthlyLimit) * 100, 100)}%`, 
                            height: '100%', 
                            background: '#008060',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </BlockStack>
                    </Box>
                    
                    <TextField
                      label={t('aiMonthlyLimit')}
                      name="aiMonthlyLimit"
                      type="number"
                      min={100}
                      max={100000}
                      value={String(aiMonthlyLimit)}
                      onChange={(v) => setAiMonthlyLimit(Number(v))}
                      helpText={t('aiMonthlyLimitHelp')}
                    />
                    
                    <Select
                      label={t('aiFallbackMode')}
                      name="aiFallbackMode"
                      options={[
                        { label: t('upsellModeCollection'), value: "collection" },
                        { label: t('upsellModeManual'), value: "manual" },
                      ]}
                      value={aiFallbackMode}
                      onChange={setAiFallbackMode}
                      helpText={t('aiFallbackModeHelp')}
                    />
                    
                    <TextField
                      label={t('aiMessageText')}
                      name="aiMessageText"
                      value={aiMessageText}
                      onChange={setAiMessageText}
                      placeholder={t('aiMessageTextPlaceholder')}
                      helpText={t('aiMessageTextHelp')}
                      autoComplete="off"
                    />

                    <TextField
                      label={t('fallbackMessageText')}
                      name="fallbackMessageText"
                      value={fallbackMessageText}
                      onChange={setFallbackMessageText}
                      placeholder={t('fallbackMessageTextPlaceholder')}
                      helpText={t('fallbackMessageTextHelp')}
                      autoComplete="off"
                    />
                    
                    <CalloutCard
                      title={t('aiComingSoon')}
                      illustration="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      primaryAction={{
                        content: t('learnMore'),
                        url: '#',
                      }}
                    >
                      <p>
                        {t('aiComingSoonText')}
                      </p>
                    </CalloutCard>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Display Rules */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('displayRules')}</Text>

                <TextField
                  label={t('maxRecommendations')}
                  name="limit"
                  type="number"
                  min={1}
                  max={6}
                  value={String(limit)}
                  onChange={(v) => setLimit(Number(v))}
                  helpText={t('maxRecommendationsHelp')}
                />

                <BlockStack gap="200">
                  <input 
                    type="hidden" 
                    name="excludeGiftCards" 
                    value={excludeGiftCards ? "true" : "false"} 
                  />
                  <Checkbox
                    label={t('excludeGiftCards')}
                    checked={excludeGiftCards}
                    onChange={setExcludeGiftCards}
                  />
                  <input 
                    type="hidden" 
                    name="excludeOutOfStock" 
                    value={excludeOutOfStock ? "true" : "false"} 
                  />
                  <Checkbox
                    label={t('excludeOutOfStock')}
                    checked={excludeOutOfStock}
                    onChange={setExcludeOutOfStock}
                  />
                  <input 
                    type="hidden" 
                    name="redirectToCart" 
                    value={redirectToCart ? "true" : "false"} 
                  />
                  <Checkbox
                    label={t('redirectToCart')}
                    checked={redirectToCart}
                    onChange={setRedirectToCart}
                  />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Widget Language */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t('widgetLanguage')}</Text>
                
                <Select
                  label={t('widgetLanguageLabel')}
                  name="widgetLocale"
                  options={localeOptions}
                  value={widgetLocale}
                  onChange={setWidgetLocale}
                  helpText={t('widgetLanguageHelp')}
                />
                
                <Text as="p" variant="bodyMd" tone="subdued">
                  {t('widgetLanguageInfo')} ({shopLocale.toUpperCase()}) {t('widgetLanguageInfoSuffix')}
                </Text>
              </BlockStack>
            </Card>

            {/* Save Actions */}
            <InlineStack align="end" gap="200">
              <Button 
                onClick={() => {
                  setUpsellMode(settings.upsellMode || "collection");
                  setManualVariantIds(settings.manualVariantIds || "");
                  setFallbackVariantIds(settings.fallbackVariantIds || "");
                  setLimit(Number(settings.limit || 3));
                  setExcludeGiftCards(!!settings.excludeGiftCards);
                  setExcludeOutOfStock(!!settings.excludeOutOfStock);
                  setRedirectToCart(settings.redirectToCart !== false);
                  setAiEnabled(!!settings.aiEnabled);
                  setAiMonthlyLimit(settings.aiMonthlyLimit || 1000);
                  setAiFallbackMode(settings.aiFallbackMode || "collection");
                  setAiMessageText(settings.aiMessageText || "Based on your browsing, we think you'll love these");
                  setFallbackMessageText(settings.fallbackMessageText || "You might also like");
                  setWidgetLocale(settings.widgetLocale || "auto");
                }}
              >                
                {t('reset')}
              </Button>
              <Button 
                variant="primary" 
                submit
                loading={navigation.state === "submitting"}
              >
                {t('saveSettings')}
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>

        <VariantSelector
          open={variantSelectorOpen}
          onClose={() => setVariantSelectorOpen(false)}
          onSelect={handleVariantSelect}
          shopify={shopify}
        />
      </BlockStack>
    </Page>
  );
}
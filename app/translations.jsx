export const translations = {
  en: {
    settings: {
      pageTitle: "Upsell Settings",
      pageDescription: "Configure how product recommendations are displayed in your store.",
      upsellSelection: "Upsell Selection",
      upsellMode: "Upsell mode",
      upsellModeCollection: "From Collection",
      upsellModeManual: "Manual Selection",
      upsellModeCollectionHelp: "Automatically recommend products from the same collection",
      upsellModeManualHelp: "Use your manually selected product variants",
      manualVariantIds: "Manual variant IDs",
      manualVariantIdsHelp: "variants selected",
      pickVariants: "Pick variants",
      clear: "Clear",
      fallbackVariantIds: "Fallback variant IDs",
      fallbackVariantIdsHelp: "fallback variants - used when collection has no matches",
      aiRecommendations: "AI Recommendations (Beta)",
      aiEnable: "Enable AI-powered recommendations",
      aiEnableHelp: "Use machine learning to recommend products based on customer behavior",
      aiCallsUsed: "AI calls used this month:",
      aiMonthlyLimit: "Monthly AI call limit",
      aiMonthlyLimitHelp: "Maximum AI recommendations per month. You'll be charged per call.",
      aiFallbackMode: "Fallback mode when limit reached",
      aiFallbackModeHelp: "Which mode to use when AI limit is reached",
      aiMessageText: "AI recommendation message",
      aiMessageTextHelp: "Message shown when AI recommendations are displayed",
      aiMessageTextPlaceholder: "Based on your browsing, we think you'll love these",
      fallbackMessageText: "Fallback message",
      fallbackMessageTextHelp: "Message shown when using fallback mode (collection/manual)",
      fallbackMessageTextPlaceholder: "You might also like",
      aiComingSoon: "AI Integration Coming Soon",
      aiComingSoonText: "The AI recommendation engine is currently in development. Settings will be saved and activated once the feature launches.",
      learnMore: "Learn more",
      displayRules: "Display Rules",
      maxRecommendations: "Maximum recommendations",
      maxRecommendationsHelp: "Number of products to show (1-6)",
      excludeGiftCards: "Exclude gift cards",
      excludeOutOfStock: "Exclude out of stock items",
      redirectToCart: "Redirect to cart after adding product",
      widgetLanguage: "Widget Language",
      widgetLanguageLabel: "Widget language",
      widgetLanguageHelp: "Choose the language for your widget. Auto uses your shop's primary language.",
      widgetLanguageInfo: "The widget will automatically use your shop's language",
      widgetLanguageInfoSuffix: "unless you select a specific language above.",
      autoShopLanguage: "Auto (Shop language:",
      reset: "Reset",
      saveSettings: "Save settings",
    },
    widget: {
      add: "Add",
      added: "Added",
      recommendations: "Recommendations",
      youMightLike: "You might also like",
    }
  },
  
  nl: {
    settings: {
      pageTitle: "Upsell Instellingen",
      pageDescription: "Configureer hoe productaanbevelingen worden weergegeven in je winkel.",
      upsellSelection: "Upsell Selectie",
      upsellMode: "Upsell modus",
      upsellModeCollection: "Uit Collectie",
      upsellModeManual: "Handmatige Selectie",
      upsellModeCollectionHelp: "Aanbevelen van producten uit dezelfde collectie",
      upsellModeManualHelp: "Gebruik je handmatig geselecteerde productvarianten",
      manualVariantIds: "Handmatige variant ID's",
      manualVariantIdsHelp: "varianten geselecteerd",
      pickVariants: "Kies varianten",
      clear: "Wissen",
      fallbackVariantIds: "Fallback variant ID's",
      fallbackVariantIdsHelp: "fallback varianten - gebruikt wanneer collectie geen matches heeft",
      aiRecommendations: "AI Aanbevelingen (Beta)",
      aiEnable: "AI-aangedreven aanbevelingen inschakelen",
      aiEnableHelp: "Gebruik machine learning om producten aan te bevelen op basis van klantgedrag",
      aiCallsUsed: "AI-oproepen gebruikt deze maand:",
      aiMonthlyLimit: "Maandelijkse AI-oproeplimiet",
      aiMonthlyLimitHelp: "Maximum AI-aanbevelingen per maand. Je wordt per oproep gefactureerd.",
      aiFallbackMode: "Fallback modus bij limiet bereikt",
      aiFallbackModeHelp: "Welke modus te gebruiken wanneer AI-limiet is bereikt",
      aiMessageText: "AI aanbevelingsbericht",
      aiMessageTextHelp: "Bericht getoond wanneer AI-aanbevelingen worden weergegeven",
      aiMessageTextPlaceholder: "Op basis van je browsegedrag denken we dat je deze leuk vindt",
      fallbackMessageText: "Fallback bericht",
      fallbackMessageTextHelp: "Bericht getoond bij gebruik van fallback modus (collectie/handmatig)",
      fallbackMessageTextPlaceholder: "Dit vind je misschien ook leuk",
      aiComingSoon: "AI Integratie Binnenkort Beschikbaar",
      aiComingSoonText: "De AI-aanbevelingsengine is momenteel in ontwikkeling. Instellingen worden opgeslagen en geactiveerd zodra de functie wordt gelanceerd.",
      learnMore: "Meer informatie",
      displayRules: "Weergaveregels",
      maxRecommendations: "Maximum aanbevelingen",
      maxRecommendationsHelp: "Aantal producten om te tonen (1-6)",
      excludeGiftCards: "Sluit cadeaubonnen uit",
      excludeOutOfStock: "Sluit uitverkochte items uit",
      redirectToCart: "Doorsturen naar winkelwagen na toevoegen product",
      widgetLanguage: "Widget Taal",
      widgetLanguageLabel: "Widget taal",
      widgetLanguageHelp: "Kies de taal voor je widget. Auto gebruikt de primaire taal van je winkel.",
      widgetLanguageInfo: "De widget gebruikt automatisch de taal van je winkel",
      widgetLanguageInfoSuffix: "tenzij je hierboven een specifieke taal selecteert.",
      autoShopLanguage: "Auto (Winkeltaal:",
      reset: "Resetten",
      saveSettings: "Instellingen opslaan",
    },
    widget: {
      add: "Toevoegen",
      added: "Toegevoegd",
      recommendations: "Aanbevelingen",
      youMightLike: "Dit vind je misschien ook leuk",
    }
  },
};

export function getTranslation(locale, key) {
  // Normaliseer locale
  const normalizedLocale = (locale?.toLowerCase() || 'en').replace('_', '-');
  
  // Probeer exacte match, dan prefix match, dan fallback naar 'en'
  let lang = 'en';
  
  // Exacte match
  if (translations[normalizedLocale]) {
    lang = normalizedLocale;
  } else {
    // Prefix match (bijv. 'nl-NL' -> 'nl')
    const prefix = normalizedLocale.split('-')[0];
    const possibleLangs = Object.keys(translations).filter(l => 
      l.toLowerCase().startsWith(prefix)
    );
    
    if (possibleLangs.length > 0) {
      lang = possibleLangs[0];
    }
  }
  
  // Haal vertaling op
  const keys = key.split('.');
  let value = translations[lang];
  
  for (const k of keys) {
    value = value?.[k];
    if (!value) {
      // Fallback naar Engels
      let fallbackValue = translations['en'];
      for (const fk of keys) {
        fallbackValue = fallbackValue?.[fk];
      }
      return fallbackValue || key;
    }
  }
  
  return value;
}

import * as WebBrowser from 'expo-web-browser';

// The published policy pages on the marketing site. Both documents promise
// they are "always available in the app", and onboarding asks people to agree
// to them, so the consent screen and Settings both open them from here.

export const PRIVACY_POLICY_URL = 'https://symetric.app/privacy';
export const TERMS_OF_USE_URL = 'https://symetric.app/terms';

export function openPrivacyPolicy() {
  return WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
}

export function openTermsOfUse() {
  return WebBrowser.openBrowserAsync(TERMS_OF_USE_URL);
}

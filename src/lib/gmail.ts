
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export async function connectGmail() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session) {
    throw new Error('Please sign in before connecting Gmail.');
  }

  const platform = Platform.OS === 'web' ? 'web' : 'android';

  const { data, error } = await supabase.functions.invoke(
    'gmail-connect',
    {
      method: 'POST',
      body: { platform },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (error) throw error;

  if (!data?.authorizationUrl) {
    throw new Error('Google authorization URL was not returned.');
  }

  const returnUrl =
    platform === 'web'
      ? 'http://localhost:8081/dashboard'
      : 'smartmail://dashboard';

  const result = await WebBrowser.openAuthSessionAsync(
    data.authorizationUrl,
    returnUrl,
  );

  if (result.type === 'success') {
    const callbackUrl = new URL(result.url);
    const gmailStatus = callbackUrl.searchParams.get('gmail');

    if (gmailStatus === 'connected') {
      return { connected: true };
    }

    if (gmailStatus === 'error') {
      throw new Error(
        callbackUrl.searchParams.get('message') ??
          'Gmail connection failed.',
      );
    }
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { connected: false };
  }

  return { connected: false };
}


export async function fetchGmailMessages() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session) {
    throw new Error('Please sign in before fetching emails.');
  }

  const { data, error } = await supabase.functions.invoke(
    'gmail-sync',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (error) {
    console.error('Gmail sync invocation failed:', error);
    throw new Error(
      error.message || 'Unable to fetch Gmail messages.',
    );
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Gmail synchronization failed.');
  }

  return data;
}

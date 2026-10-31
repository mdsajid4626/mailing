
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { signOut } from '../lib/auth';
import {
    connectGmail,
    fetchGmailMessages,
} from '../lib/gmail';
import { supabase } from '../lib/supabase';

// Completes the browser authentication session on web.
WebBrowser.maybeCompleteAuthSession();

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export default function DashboardScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [databaseStatus, setDatabaseStatus] = useState('Checking...');

  const [gmailAddress, setGmailAddress] = useState('');
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailMessage, setGmailMessage] = useState('');

  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    initializeDashboard();
  }, []);

  async function initializeDashboard() {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace('/');
        return;
      }

      setEmail(session.user.email ?? '');

      // Check Supabase database connection.
      const { error: databaseError } = await supabase
        .from('mail_accounts')
        .select('id')
        .limit(1);

      if (databaseError) {
        setDatabaseStatus('Connection failed');
      } else {
        setDatabaseStatus('Connected');
      }

      // Check existing Gmail connection.
      const { data: account, error: accountError } =
        await supabase
          .from('mail_accounts')
          .select('gmail_address')
          .eq('user_id', session.user.id)
          .eq('sync_status', 'connected')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (!accountError && account?.gmail_address) {
        setGmailAddress(account.gmail_address);
      }
    } catch (error) {
      console.error('Dashboard initialization error:', error);
      setDatabaseStatus('Connection failed');
    }
  }

  // Connect Gmail using Google OAuth.
  async function handleConnectGmail() {
    setGmailLoading(true);
    setGmailMessage('');

    try {
      const result = await connectGmail();

      if (result.connected) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          const { data: account, error } = await supabase
            .from('mail_accounts')
            .select('gmail_address')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;

          if (account?.gmail_address) {
            setGmailAddress(account.gmail_address);
          }
        }

        setGmailMessage('Gmail connected successfully!');
      } else {
        setGmailMessage(
          'Gmail connection was cancelled or not completed.',
        );
      }
    } catch (error) {
      console.error('Gmail connection error:', error);

      setGmailMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect Gmail. Please try again.',
      );
    } finally {
      setGmailLoading(false);
    }
  }

  // Fetch Gmail messages using the backend Edge Function.
  async function handleSyncGmail() {
    setSyncLoading(true);
    setSyncMessage('');

    try {
      const result = await fetchGmailMessages();

      setEmails(result.messages ?? []);

      setSyncMessage(
        `Successfully fetched ${result.total} emails from ${result.account}.`,
      );
    } catch (error) {
      console.error('Email fetching error:', error);

      setSyncMessage(
        error instanceof Error
          ? error.message
          : 'Failed to fetch Gmail messages.',
      );
    } finally {
      setSyncLoading(false);
    }
  }

  // Logout from Smart Mail.
  async function handleLogout() {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>Smart Mail</Text>
          <Text style={styles.subtitle}>
            Your intelligent email assistant
          </Text>
        </View>

        {/* Welcome Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome</Text>

          <Text style={styles.email}>{email}</Text>

          <Text style={styles.description}>
            Your Smart Mail account is ready.
          </Text>
        </View>

        {/* Backend Connection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Backend Connection
          </Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                databaseStatus === 'Connected'
                  ? styles.successDot
                  : styles.errorDot,
              ]}
            />

            <Text style={styles.statusText}>
              Supabase Database: {databaseStatus}
            </Text>
          </View>
        </View>

        {/* Gmail Integration */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Gmail Integration
          </Text>

          {gmailAddress ? (
            <>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    styles.successDot,
                  ]}
                />

                <Text style={styles.statusText}>
                  Gmail connected
                </Text>
              </View>

              <Text style={styles.email}>
                {gmailAddress}
              </Text>
            </>
          ) : (
            <Text style={styles.description}>
              Connect your Gmail account to allow Smart Mail
              to read your emails.
            </Text>
          )}

          <Pressable
            style={[
              styles.connectButton,
              gmailLoading && styles.disabledButton,
            ]}
            onPress={handleConnectGmail}
            disabled={gmailLoading}
          >
            {gmailLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.connectButtonText}>
                {gmailAddress
                  ? 'Reconnect Gmail'
                  : 'Connect Gmail'}
              </Text>
            )}
          </Pressable>

          {gmailMessage ? (
            <Text style={styles.message}>
              {gmailMessage}
            </Text>
          ) : null}
        </View>

        {/* Inbox */}
        <View style={styles.card}>
          <View style={styles.inboxHeader}>
            <Text style={styles.cardTitle}>Inbox</Text>

            <Text style={styles.emailCount}>
              {emails.length} emails
            </Text>
          </View>

          <Pressable
            style={[
              styles.connectButton,
              (syncLoading || !gmailAddress) &&
                styles.disabledButton,
            ]}
            onPress={handleSyncGmail}
            disabled={syncLoading || !gmailAddress}
          >
            {syncLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.connectButtonText}>
                Sync Gmail Messages
              </Text>
            )}
          </Pressable>

          {syncMessage ? (
            <Text style={styles.message}>
              {syncMessage}
            </Text>
          ) : null}

          {emails.length === 0 && !syncLoading ? (
            <Text style={styles.emptyInbox}>
              {gmailAddress
                ? 'Your inbox is empty here. Tap Sync Gmail Messages to load emails.'
                : 'Connect Gmail to view your inbox.'}
            </Text>
          ) : null}

          {emails.map((item) => (
            <View key={item.id} style={styles.emailItem}>
              <View style={styles.emailItemHeader}>
                <Text
                  style={[
                    styles.subject,
                    item.unread && styles.unreadSubject,
                  ]}
                  numberOfLines={2}
                >
                  {item.subject || '(No subject)'}
                </Text>

                {item.unread ? (
                  <View style={styles.unreadDot} />
                ) : null}
              </View>

              <Text
                style={styles.sender}
                numberOfLines={1}
              >
                From: {item.from || 'Unknown sender'}
              </Text>

              <Text
                style={styles.date}
                numberOfLines={1}
              >
                {item.date}
              </Text>

              <Text
                style={styles.snippet}
                numberOfLines={3}
              >
                {item.snippet}
              </Text>
            </View>
          ))}
        </View>

        {/* Coming Next */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Coming Next
          </Text>

          <Text style={styles.feature}>
            • Smart email categorization
          </Text>

          <Text style={styles.feature}>
            • Event and deadline detection
          </Text>

          <Text style={styles.feature}>
            • Google Calendar integration
          </Text>
        </View>

        {/* Logout */}
        <Pressable
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    marginTop: 30,
    marginBottom: 25,
  },

  logo: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#208AEF',
  },

  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 5,
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    elevation: 2,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
  },

  email: {
    fontSize: 14,
    color: '#208AEF',
    marginTop: 8,
  },

  description: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 9,
  },

  successDot: {
    backgroundColor: '#16A34A',
  },

  errorDot: {
    backgroundColor: '#DC2626',
  },

  statusText: {
    fontSize: 14,
    color: '#334155',
  },

  connectButton: {
    backgroundColor: '#208AEF',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },

  disabledButton: {
    opacity: 0.6,
  },

  connectButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  message: {
    fontSize: 13,
    color: '#475569',
    marginTop: 12,
    lineHeight: 19,
  },

  inboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  emailCount: {
    color: '#208AEF',
    fontSize: 13,
    fontWeight: '600',
  },

  emptyInbox: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 20,
  },

  emailItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 16,
  },

  emailItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  subject: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
  },

  unreadSubject: {
    fontWeight: 'bold',
    color: '#0F172A',
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#208AEF',
    marginLeft: 8,
  },

  sender: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 7,
  },

  date: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },

  snippet: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  feature: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 9,
  },

  logoutButton: {
    backgroundColor: '#DC2626',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 20,
  },

  logoutText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

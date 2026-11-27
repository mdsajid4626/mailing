import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

import { signOut } from '../lib/auth';
import { connectGmail, fetchGmailMessages } from '../lib/gmail';
import { supabase } from '../lib/supabase';

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

const COLORS = {
  bg: '#F4F5FB',
  surface: '#FFFFFF',
  ink: '#0F1330',
  inkSoft: '#1A1F4A',
  indigo: '#5B5BF0',
  indigoDark: '#4545D6',
  indigoSoft: '#EEEEFE',
  violet: '#8B5CF6',
  text: '#3A4160',
  muted: '#7A839C',
  border: '#E8EAF3',
  green: '#12A56B',
  greenBg: '#E6F7F0',
  amber: '#D98A0B',
  amberBg: '#FDF3E1',
  red: '#D64550',
  redBg: '#FDECEE',
};

const AVATAR_COLORS = [
  '#5B5BF0',
  '#8B5CF6',
  '#0EA5E9',
  '#12A56B',
  '#F59E0B',
  '#EC4899',
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function parseSender(from: string) {
  const raw = from || 'Unknown sender';
  const match = raw.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  const name = (match?.[1] || '').trim() || (match?.[2] || raw).split('@')[0];
  const initial = name.charAt(0).toUpperCase() || '?';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return { name, initial, color };
}

/* ------------------------------------------------------------------ */
/* Animation building blocks (built-in Animated API, no new packages)  */
/* ------------------------------------------------------------------ */

function FadeInUp({
  delay = 0,
  distance = 22,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 600,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ScalePressable({
  onPress,
  disabled,
  style,
  containerStyle,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, containerStyle]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animateTo(0.96)}
        onPressOut={() => animateTo(1)}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function AnimatedNumber({ value, style }: { value: number; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  return <Text style={style}>{display}</Text>;
}

function PulseDot({ color, size = 10 }: { color: string; size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ width: size * 2.4, height: size * 2.4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) },
          ],
        }}
      />
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
      />
    </View>
  );
}

function FloatingOrb({
  size,
  color,
  style,
  duration = 4200,
  travel = 12,
}: {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  travel?: number;
}) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [
            {
              translateY: float.interpolate({
                inputRange: [0, 1],
                outputRange: [-travel, travel],
              }),
            },
          ],
        },
        style,
      ]}
    />
  );
}

function SkeletonRow() {
  const shimmer = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View style={[styles.skeletonRow, { opacity: shimmer }]}>
      <View style={styles.skeletonAvatar} />
      <View style={{ flex: 1 }}>
        <View style={[styles.skeletonLine, { width: '45%' }]} />
        <View style={[styles.skeletonLine, { width: '80%', marginTop: 9 }]} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 9 }]} />
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

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

      const { error: databaseError } = await supabase
        .from('mail_accounts')
        .select('id')
        .limit(1);

      setDatabaseStatus(databaseError ? 'Connection failed' : 'Connected');

      const { data: account, error: accountError } = await supabase
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

        setGmailMessage('Gmail connected successfully.');
      } else {
        setGmailMessage('Gmail connection was cancelled or not completed.');
      }
    } catch (error) {
      console.error('Gmail connection error:', error);

      setGmailMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect Gmail. Please try again.'
      );
    } finally {
      setGmailLoading(false);
    }
  }

  async function handleSyncGmail() {
    setSyncLoading(true);
    setSyncMessage('');

    try {
      const result = await fetchGmailMessages();

      setEmails(result.messages ?? []);

      setSyncMessage(
        `Successfully fetched ${result.total} emails from ${result.account}.`
      );
    } catch (error) {
      console.error('Email fetching error:', error);

      setSyncMessage(
        error instanceof Error ? error.message : 'Failed to fetch Gmail messages.'
      );
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const unreadCount = emails.filter((item) => item.unread).length;
  const firstName = email ? email.split('@')[0].split(/[._-]/)[0] : '';
  const displayName = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : 'there';
  const dbOk = databaseStatus === 'Connected';

  /* ---------------- Sidebar ---------------- */

  const navItems: { icon: string; label: string; active?: boolean; soon?: boolean; onPress?: () => void }[] = [
    { icon: '▦', label: 'Overview', active: true },
    { icon: '✉', label: 'Smart Inbox', onPress: () => router.push('/inbox') },
    { icon: '▤', label: 'Events', soon: true },
    { icon: '▣', label: 'Calendar', soon: true },
    { icon: '⚙', label: 'Settings', soon: true },
  ];

  const sidebar = (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandIconText}>S</Text>
        </View>
        <View>
          <Text style={styles.sidebarBrandText}>Smart Mail</Text>
          <Text style={styles.sidebarBrandTag}>AI inbox workspace</Text>
        </View>
      </View>

      <Text style={styles.sidebarLabel}>WORKSPACE</Text>

      {navItems.map((item, index) => (
        <FadeInUp key={item.label} delay={120 + index * 70} distance={10}>
          <Pressable
            onPress={item.onPress}
            disabled={!item.onPress}
            style={(state: any) => [
              styles.navItem,
              item.active && styles.navItemActive,
              !item.active && state.hovered && styles.navItemHover,
              state.pressed && { opacity: 0.8 },
            ]}
          >
            {item.active && <View style={styles.navActiveBar} />}
            <Text style={[styles.navIcon, item.active && styles.navIconActive]}>
              {item.icon}
            </Text>
            <Text style={[styles.navText, item.active && styles.navTextActive]}>
              {item.label}
            </Text>
            {item.soon && (
              <View style={styles.navSoon}>
                <Text style={styles.navSoonText}>SOON</Text>
              </View>
            )}
          </Pressable>
        </FadeInUp>
      ))}

      <View style={styles.sidebarBottom}>
        <View style={styles.sidebarAccount}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {email ? email.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName} numberOfLines={1}>
              {email}
            </Text>
            <Text style={styles.accountRole}>Personal workspace</Text>
          </View>
        </View>

        <ScalePressable onPress={handleLogout} style={styles.sidebarLogout}>
          <Text style={styles.sidebarLogoutText}>Sign out</Text>
        </ScalePressable>
      </View>
    </View>
  );

  /* ---------------- Stats ---------------- */

  const stats = [
    {
      icon: '✉',
      label: 'Fetched emails',
      caption: 'Messages loaded',
      tint: COLORS.indigo,
      tintBg: COLORS.indigoSoft,
      node: <AnimatedNumber value={emails.length} style={styles.statNumber} />,
    },
    {
      icon: '●',
      label: 'Unread',
      caption: 'Awaiting your attention',
      tint: COLORS.violet,
      tintBg: '#F1EBFE',
      node: <AnimatedNumber value={unreadCount} style={styles.statNumber} />,
    },
    {
      icon: 'G',
      label: 'Gmail',
      caption: 'Google account',
      tint: gmailAddress ? COLORS.green : COLORS.amber,
      tintBg: gmailAddress ? COLORS.greenBg : COLORS.amberBg,
      node: (
        <View style={styles.statStatusRow}>
          <PulseDot color={gmailAddress ? COLORS.green : COLORS.amber} size={8} />
          <Text
            style={[
              styles.statStatus,
              { color: gmailAddress ? COLORS.green : COLORS.amber },
            ]}
          >
            {gmailAddress ? 'Connected' : 'Not connected'}
          </Text>
        </View>
      ),
    },
    {
      icon: '◈',
      label: 'Database',
      caption: 'Supabase service',
      tint: dbOk ? COLORS.green : COLORS.red,
      tintBg: dbOk ? COLORS.greenBg : COLORS.redBg,
      node: (
        <View style={styles.statStatusRow}>
          <PulseDot color={dbOk ? COLORS.green : COLORS.red} size={8} />
          <Text
            style={[styles.statStatus, { color: dbOk ? COLORS.green : COLORS.red }]}
          >
            {databaseStatus}
          </Text>
        </View>
      ),
    },
  ];

  /* ---------------- Panels ---------------- */

  const emailsPanel = (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Recent emails</Text>
          <Text style={styles.panelDescription}>
            {emails.length > 0
              ? `${emails.length} messages · ${unreadCount} unread`
              : 'Recently fetched Gmail messages'}
          </Text>
        </View>

        <ScalePressable
          onPress={handleSyncGmail}
          disabled={syncLoading || !gmailAddress}
          style={[
            styles.syncButton,
            (syncLoading || !gmailAddress) && styles.disabledButton,
          ]}
        >
          {syncLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.syncButtonText}>↻  Sync emails</Text>
          )}
        </ScalePressable>
      </View>

      {!!syncMessage && (
        <FadeInUp distance={8}>
          <View style={styles.feedbackPill}>
            <Text style={styles.feedbackText}>{syncMessage}</Text>
          </View>
        </FadeInUp>
      )}

      {syncLoading && emails.length === 0 && (
        <View>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      )}

      {emails.length === 0 && !syncLoading && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Text style={styles.emptyIcon}>✉</Text>
          </View>
          <Text style={styles.emptyTitle}>No messages loaded</Text>
          <Text style={styles.emptyDescription}>
            {gmailAddress
              ? 'Tap “Sync emails” to pull in your latest Gmail messages.'
              : 'Connect your Gmail account to get started.'}
          </Text>
        </View>
      )}

      {emails.map((item, index) => {
        const sender = parseSender(item.from);
        return (
          <FadeInUp key={item.id} delay={Math.min(index, 8) * 60} distance={14}>
            <View style={styles.emailItem}>
              <View style={[styles.emailAvatar, { backgroundColor: sender.color }]}>
                <Text style={styles.emailAvatarText}>{sender.initial}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.emailTopRow}>
                  <Text
                    style={[styles.emailSender, item.unread && styles.unreadText]}
                    numberOfLines={1}
                  >
                    {sender.name}
                  </Text>
                  <View style={styles.emailDateContainer}>
                    <Text style={styles.emailDate} numberOfLines={1}>
                      {item.date}
                    </Text>
                    {item.unread && <View style={styles.unreadDot} />}
                  </View>
                </View>

                <Text
                  style={[styles.emailSubject, item.unread && styles.unreadText]}
                  numberOfLines={1}
                >
                  {item.subject || '(No subject)'}
                </Text>
                <Text style={styles.emailSnippet} numberOfLines={2}>
                  {item.snippet}
                </Text>
              </View>
            </View>
          </FadeInUp>
        );
      })}
    </View>
  );

  const gmailPanel = (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.gmailIcon}>
          <Text style={styles.gmailIconText}>G</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle}>Gmail integration</Text>
          <Text style={styles.panelDescription}>
            Connect your mailbox to access messages.
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            gmailAddress ? styles.connectedBadge : styles.pendingBadge,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: gmailAddress ? COLORS.green : COLORS.amber },
            ]}
          >
            {gmailAddress ? 'LIVE' : 'SETUP'}
          </Text>
        </View>
      </View>

      {gmailAddress ? (
        <View style={styles.connectedAccount}>
          <PulseDot color={COLORS.green} size={8} />
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={styles.connectedLabel}>CONNECTED ACCOUNT</Text>
            <Text style={styles.connectedEmail} numberOfLines={1}>
              {gmailAddress}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>No Gmail account is currently connected.</Text>
      )}

      <ScalePressable
        onPress={handleConnectGmail}
        disabled={gmailLoading}
        style={[styles.primaryButton, gmailLoading && styles.disabledButton]}
      >
        {gmailLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {gmailAddress ? 'Reconnect Gmail' : 'Connect Gmail'}
          </Text>
        )}
      </ScalePressable>

      {!!gmailMessage && (
        <FadeInUp distance={8}>
          <View style={styles.feedbackPill}>
            <Text style={styles.feedbackText}>{gmailMessage}</Text>
          </View>
        </FadeInUp>
      )}

      <ScalePressable
        onPress={() => router.push('/inbox')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Open Smart Inbox  →</Text>
      </ScalePressable>
    </View>
  );

  const upcoming = [
    { icon: '✉', title: 'Smart Inbox', desc: 'Organize important emails.' },
    { icon: '▤', title: 'Events', desc: 'Track meetings and deadlines.' },
    { icon: '▣', title: 'Calendar', desc: 'Manage important dates.' },
  ];

  const featurePanel = (
    <View style={styles.panel}>
      <Text style={[styles.panelTitle, { marginBottom: 14 }]}>Coming soon</Text>
      {upcoming.map((item, index) => (
        <View
          key={item.title}
          style={[styles.featureRow, index === upcoming.length - 1 && { borderBottomWidth: 0 }]}
        >
          <View style={styles.featureIconWrap}>
            <Text style={styles.featureIcon}>{item.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>{item.title}</Text>
            <Text style={styles.featureDescription}>{item.desc}</Text>
          </View>
          <View style={styles.soonPill}>
            <Text style={styles.soonPillText}>SOON</Text>
          </View>
        </View>
      ))}
    </View>
  );

  /* ---------------- Render ---------------- */

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        {isDesktop && sidebar}

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <FadeInUp delay={0} distance={12} style={styles.topHeader}>
            <View style={{ flex: 1 }}>
              {!isDesktop && <Text style={styles.mobileBrand}>SMART MAIL</Text>}
              <Text style={styles.pageTitle}>Overview</Text>
              <Text style={styles.pageSubtitle}>
                Here's what's happening in your email workspace.
              </Text>
            </View>

            {!isDesktop && (
              <ScalePressable onPress={handleLogout} style={styles.mobileSignOut}>
                <Text style={styles.mobileSignOutText}>Sign out</Text>
              </ScalePressable>
            )}
          </FadeInUp>

          {/* Hero banner */}
          <FadeInUp delay={90}>
            <View style={styles.hero}>
              <FloatingOrb
                size={210}
                color="rgba(139,92,246,0.35)"
                style={{ right: -50, top: -70 }}
                duration={5200}
                travel={14}
              />
              <FloatingOrb
                size={120}
                color="rgba(91,91,240,0.45)"
                style={{ right: 120, bottom: -50 }}
                duration={4200}
                travel={10}
              />
              <FloatingOrb
                size={60}
                color="rgba(255,255,255,0.08)"
                style={{ right: 60, top: 40 }}
                duration={3600}
                travel={8}
              />

              <View style={styles.heroContent}>
                <View style={styles.heroChip}>
                  <PulseDot color="#7CF2B8" size={6} />
                  <Text style={styles.heroChipText}>YOUR WORKSPACE</Text>
                </View>
                <Text style={styles.heroTitle}>
                  {getGreeting()}, {displayName} 👋
                </Text>
                <Text style={styles.heroDescription}>
                  Stay organized. Stay ahead. Manage your emails and keep track of
                  important updates in one place.
                </Text>

                <View style={styles.heroActions}>
                  <ScalePressable
                    onPress={gmailAddress ? handleSyncGmail : handleConnectGmail}
                    disabled={syncLoading || gmailLoading}
                    style={styles.heroPrimary}
                  >
                    <Text style={styles.heroPrimaryText}>
                      {gmailAddress ? '↻  Sync emails' : 'Connect Gmail'}
                    </Text>
                  </ScalePressable>

                  <ScalePressable
                    onPress={() => router.push('/inbox')}
                    style={styles.heroSecondary}
                  >
                    <Text style={styles.heroSecondaryText}>Open Smart Inbox</Text>
                  </ScalePressable>
                </View>
              </View>
            </View>
          </FadeInUp>

          {/* Stats */}
          <View style={styles.statsGrid}>
            {stats.map((stat, index) => (
              <FadeInUp
                key={stat.label}
                delay={180 + index * 80}
                style={styles.statCardWrap}
              >
                <View style={styles.statCard}>
                  <View style={styles.statTop}>
                    <Text style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
                    <View style={[styles.statIconWrap, { backgroundColor: stat.tintBg }]}>
                      <Text style={[styles.statIcon, { color: stat.tint }]}>
                        {stat.icon}
                      </Text>
                    </View>
                  </View>
                  {stat.node}
                  <Text style={styles.statCaption}>{stat.caption}</Text>
                </View>
              </FadeInUp>
            ))}
          </View>

          {/* Main columns */}
          <View style={[styles.columns, isDesktop && styles.columnsDesktop]}>
            <FadeInUp delay={500} style={isDesktop ? styles.colMain : undefined}>
              {emailsPanel}
            </FadeInUp>

            <FadeInUp delay={600} style={isDesktop ? styles.colSide : undefined}>
              {gmailPanel}
              {featurePanel}
            </FadeInUp>
          </View>

          {/* Mobile account */}
          {!isDesktop && (
            <FadeInUp delay={700}>
              <View style={styles.mobileAccount}>
                <Text style={styles.accountHeading}>ACCOUNT</Text>
                <Text style={styles.accountEmail}>{email}</Text>
                <ScalePressable onPress={handleLogout} style={styles.logoutButton}>
                  <Text style={styles.logoutButtonText}>Sign out</Text>
                </ScalePressable>
              </View>
            </FadeInUp>
          )}

          <Text style={styles.footer}>SMART MAIL  •  YOUR EMAIL, ORGANIZED.</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const softShadow = {
  shadowColor: '#1B1F4B',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 20,
  elevation: 3,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  app: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
  },

  /* Sidebar */
  sidebar: {
    width: 260,
    backgroundColor: COLORS.ink,
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 20,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 4,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.indigo,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandIconText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  sidebarBrandText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sidebarBrandTag: {
    color: '#7F88B8',
    fontSize: 10,
    marginTop: 2,
  },
  sidebarLabel: {
    color: '#6B74A6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: 'rgba(91,91,240,0.22)',
  },
  navItemHover: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  navActiveBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#8F8FFF',
  },
  navIcon: {
    width: 26,
    color: '#8790BF',
    fontSize: 15,
  },
  navIconActive: {
    color: '#C9C9FF',
  },
  navText: {
    flex: 1,
    color: '#B3BAE0',
    fontSize: 13,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#FFFFFF',
  },
  navSoon: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  navSoonText: {
    color: '#8790BF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sidebarBottom: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 18,
  },
  sidebarAccount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  accountRole: {
    color: '#7F88B8',
    fontSize: 10,
    marginTop: 3,
  },
  sidebarLogout: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sidebarLogoutText: {
    color: '#F2B8BE',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },

  /* Main */
  mainScroll: {
    flex: 1,
  },
  mainContent: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 45,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  mobileBrand: {
    color: COLORS.indigo,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
  },
  pageTitle: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 5,
  },
  mobileSignOut: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  mobileSignOutText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },

  /* Hero */
  hero: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 22,
    padding: 28,
    overflow: 'hidden',
    marginBottom: 22,
    minHeight: 190,
    justifyContent: 'center',
  },
  heroContent: {
    zIndex: 2,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginBottom: 14,
  },
  heroChipText: {
    color: '#D8DDFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginLeft: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroDescription: {
    color: '#BFC7EE',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 480,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  heroPrimary: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 11,
  },
  heroPrimaryText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  heroSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 11,
  },
  heroSecondaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 22,
  },
  statCardWrap: {
    flexGrow: 1,
    flexBasis: 200,
  },
  statCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    minHeight: 125,
    ...softShadow,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIcon: {
    fontSize: 14,
    fontWeight: '800',
  },
  statNumber: {
    color: COLORS.ink,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 10,
  },
  statStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginLeft: -6,
  },
  statStatus: {
    fontSize: 17,
    fontWeight: '800',
    marginLeft: -2,
  },
  statCaption: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 6,
  },

  /* Columns */
  columns: {
    gap: 18,
  },
  columnsDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  colMain: {
    flex: 1.7,
  },
  colSide: {
    flex: 1,
    minWidth: 320,
  },

  /* Panels */
  panel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    ...softShadow,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  panelTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  panelDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },

  /* Gmail */
  gmailIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FDEEEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gmailIconText: {
    color: '#D2483B',
    fontSize: 22,
    fontWeight: '800',
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 20,
  },
  connectedBadge: {
    backgroundColor: COLORS.greenBg,
  },
  pendingBadge: {
    backgroundColor: COLORS.amberBg,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  connectedAccount: {
    backgroundColor: '#F7F8FD',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  connectedLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  connectedEmail: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: COLORS.indigo,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    shadowColor: COLORS.indigo,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: COLORS.indigoSoft,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: COLORS.indigoDark,
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  feedbackPill: {
    backgroundColor: COLORS.indigoSoft,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  feedbackText: {
    color: COLORS.indigoDark,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
  },

  /* Sync */
  syncButton: {
    backgroundColor: COLORS.indigo,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 10,
    minWidth: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  /* Skeleton */
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6E9F4',
    marginRight: 12,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E6E9F4',
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    color: COLORS.indigo,
    fontSize: 26,
  },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyDescription: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 300,
  },

  /* Emails */
  emailItem: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 15,
  },
  emailAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailAvatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  emailSender: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  emailDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  emailDate: {
    color: COLORS.muted,
    fontSize: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.indigo,
  },
  emailSubject: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  unreadText: {
    color: COLORS.ink,
    fontWeight: '800',
  },
  emailSnippet: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  /* Features */
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIcon: {
    color: COLORS.indigo,
    fontSize: 16,
  },
  featureTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  featureDescription: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 3,
  },
  soonPill: {
    backgroundColor: COLORS.amberBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  soonPillText: {
    color: COLORS.amber,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* Mobile account */
  mobileAccount: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  accountHeading: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  accountEmail: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  logoutButton: {
    marginTop: 14,
    padding: 12,
    backgroundColor: COLORS.redBg,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: '800',
  },

  footer: {
    color: '#A3ABC4',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 8,
  },
});
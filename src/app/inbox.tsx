
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { fetchGmailMessages } from '@/lib/gmail';

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

type FilterType =
  | 'All'
  | 'Unread'
  | 'Important'
  | 'Meetings'
  | 'Promotions'
  | 'Social';

type Category =
  | 'Primary'
  | 'Important'
  | 'Meeting'
  | 'Promotion'
  | 'Social';

function getCategory(message: GmailMessage): Category {
  const text = [
    message.subject,
    message.from,
    message.snippet,
  ].join(' ').toLowerCase();

  if (
    /meeting|calendar invite|invitation|zoom|google meet|teams meeting|webinar|appointment/.test(text)
  ) {
    return 'Meeting';
  }

  if (
    /unsubscribe|discount|sale|offer|coupon|promo|newsletter|special price/.test(text)
  ) {
    return 'Promotion';
  }

  if (
    /linkedin|facebook|instagram|twitter|social notification|new follower/.test(text)
  ) {
    return 'Social';
  }

  if (
    /urgent|important|deadline|due date|action required|interview|exam|assignment|submission|payment required/.test(text)
  ) {
    return 'Important';
  }

  return 'Primary';
}

const filters: FilterType[] = [
  'All',
  'Unread',
  'Important',
  'Meetings',
  'Promotions',
  'Social',
];

export default function InboxScreen() {
  const router = useRouter();

  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [filter, setFilter] = useState<FilterType>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedEmail, setSelectedEmail] =
    useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    setError('');

    try {
      const result = await fetchGmailMessages();
      setEmails(result.messages ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your emails.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const unreadCount = emails.filter(
    (email) => email.unread,
  ).length;

  const meetingCount = emails.filter(
    (email) => getCategory(email) === 'Meeting',
  ).length;

  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      const category = getCategory(email);

      const matchesFilter =
        filter === 'All' ||
        (filter === 'Unread' && email.unread) ||
        (filter === 'Important' &&
          category === 'Important') ||
        (filter === 'Meetings' &&
          category === 'Meeting') ||
        (filter === 'Promotions' &&
          category === 'Promotion') ||
        (filter === 'Social' &&
          category === 'Social');

      const searchText = [
        email.from,
        email.subject,
        email.snippet,
      ].join(' ').toLowerCase();

      return (
        matchesFilter &&
        searchText.includes(search.toLowerCase().trim())
      );
    });
  }, [emails, filter, search]);

  function categoryColor(category: Category) {
    switch (category) {
      case 'Meeting':
        return '#2563EB';
      case 'Important':
        return '#DC6B35';
      case 'Promotion':
        return '#15966A';
      case 'Social':
        return '#8B5CF6';
      default:
        return '#64748B';
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadEmails();
            }}
            tintColor="#234C72"
          />
        }
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/dashboard')}>
            <Text style={styles.back}>‹ Dashboard</Text>
          </Pressable>

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Smart Inbox</Text>
              <Text style={styles.subtitle}>
                Your emails, organized in one place.
              </Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              onPress={() => {
                setRefreshing(true);
                loadEmails();
              }}
              disabled={loading || refreshing}
            >
              <Text style={styles.refreshText}>↻ Sync</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {emails.length}
            </Text>
            <Text style={styles.statLabel}>Total emails</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {unreadCount}
            </Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {meetingCount}
            </Text>
            <Text style={styles.statLabel}>Meetings</Text>
          </View>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search sender, subject or email..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.sectionTitle}>Categories</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.filterButton,
                filter === item && styles.activeFilter,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.activeFilterText,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            {filter === 'All' ? 'All messages' : filter}
          </Text>
          <Text style={styles.count}>
            {filteredEmails.length} emails
          </Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#234C72" />
            <Text style={styles.loadingText}>
              Loading your emails...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              Unable to load emails
            </Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                loadEmails();
              }}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredEmails.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No emails found
            </Text>
            <Text style={styles.emptyText}>
              Try another category or search term.
            </Text>
          </View>
        ) : (
          filteredEmails.map((email) => {
            const category = getCategory(email);
            const expanded = selectedEmail === email.id;

            return (
              <Pressable
                key={email.id}
                style={[
                  styles.emailCard,
                  email.unread && styles.unreadCard,
                ]}
                onPress={() =>
                  setSelectedEmail(
                    expanded ? null : email.id,
                  )
                }
              >
                <View style={styles.emailTop}>
                  <View style={styles.senderRow}>
                    {email.unread && (
                      <View style={styles.unreadDot} />
                    )}
                    <Text
                      style={[
                        styles.sender,
                        email.unread && styles.unreadText,
                      ]}
                      numberOfLines={1}
                    >
                      {email.from || 'Unknown sender'}
                    </Text>
                  </View>

                  <Text style={styles.date} numberOfLines={1}>
                    {email.date}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.subject,
                    email.unread && styles.unreadText,
                  ]}
                  numberOfLines={2}
                >
                  {email.subject || '(No subject)'}
                </Text>

                <Text
                  style={styles.snippet}
                  numberOfLines={expanded ? undefined : 2}
                >
                  {email.snippet}
                </Text>

                <View style={styles.emailBottom}>
                  <View
                    style={[
                      styles.categoryBadge,
                      {
                        backgroundColor: categoryColor(category),
                      },
                    ]}
                  >
                    <Text style={styles.categoryText}>
                      {category}
                    </Text>
                  </View>

                  <Text style={styles.tapHint}>
                    {expanded ? 'Show less' : 'View preview ›'}
                  </Text>
                </View>

                {expanded && (
                  <View style={styles.details}>
                    <Text style={styles.detailText}>
                      From: {email.from}
                    </Text>
                    <Text style={styles.detailText}>
                      To: {email.to}
                    </Text>
                    <Text style={styles.detailText}>
                      Date: {email.date}
                    </Text>
                    <Text style={styles.detailText}>
                      Thread ID: {email.threadId}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        <Text style={styles.footer}>
          Smart Mail · Rule-based email organization
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },
  container: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 45,
  },
  header: {
    marginTop: 12,
    marginBottom: 22,
  },
  back: {
    color: '#64748B',
    fontSize: 14,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#172B4D',
    fontSize: 29,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 5,
  },
  refreshButton: {
    backgroundColor: '#234C72',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 9,
  },
  refreshText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5EAF0',
  },
  statNumber: {
    fontSize: 25,
    fontWeight: '800',
    color: '#172B4D',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 5,
  },
  search: {
    height: 49,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE3EB',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 14,
    color: '#172B4D',
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#172B4D',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 15,
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE3EB',
  },
  activeFilter: {
    backgroundColor: '#234C72',
    borderColor: '#234C72',
  },
  filterText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  count: {
    color: '#64748B',
    fontSize: 12,
  },
  emailCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    marginBottom: 11,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#234C72',
  },
  emailTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    marginRight: 7,
  },
  sender: {
    fontSize: 13,
    color: '#64748B',
    flex: 1,
  },
  unreadText: {
    fontWeight: '800',
    color: '#172B4D',
  },
  date: {
    color: '#94A3B8',
    fontSize: 11,
  },
  subject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginTop: 9,
  },
  snippet: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginTop: 6,
  },
  emailBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tapHint: {
    fontSize: 12,
    color: '#64748B',
  },
  details: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5EAF0',
    gap: 7,
  },
  detailText: {
    fontSize: 12,
    color: '#475569',
  },
  center: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    color: '#172B4D',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#234C72',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 15,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 25,
  },
});

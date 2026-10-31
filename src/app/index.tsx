
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signIn, signUp } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Check whether the user is already logged in.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.session) {
        router.replace('/dashboard');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/dashboard');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSubmit() {
    setMessage('');

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setMessage('Please enter your email and password.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setMessage('Password must contain at least 6 characters.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(cleanEmail, password);
        router.replace('/dashboard');
      } else {
        const data = await signUp(cleanEmail, password);

        if (data.session) {
          router.replace('/dashboard');
        } else {
          setMessage(
            'Account created. Please check your email and confirm your account before logging in.'
          );
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Something went wrong.';

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>M</Text>
            </View>

            <Text style={styles.brand}>Smart Mail</Text>
            <Text style={styles.subtitle}>
              One inbox. Everything organized.
            </Text>

            <View style={styles.card}>
              <Text style={styles.heading}>
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </Text>

              <Text style={styles.description}>
                {mode === 'login'
                  ? 'Sign in to continue to your smart inbox.'
                  : 'Create an account to get started with Smart Mail.'}
              </Text>

              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#8B95A5"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#8B95A5"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />

              {mode === 'signup' && (
                <>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter your password"
                    placeholderTextColor="#8B95A5"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    editable={!loading}
                  />
                </>
              )}

              {!!message && (
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>{message}</Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  loading && styles.disabled,
                ]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {mode === 'login' ? 'Login' : 'Create account'}
                  </Text>
                )}
              </Pressable>

              <View style={styles.switchRow}>
                <Text style={styles.switchText}>
                  {mode === 'login'
                    ? "Don't have an account?"
                    : 'Already have an account?'}
                </Text>

                <Pressable
                  onPress={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setMessage('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.switchLink}>
                    {mode === 'login' ? 'Sign Up' : 'Login'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.footer}>
              Your email. Your control. One smarter inbox.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#14213D',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 7,
    marginBottom: 30,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5EAF1',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#14213D',
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    marginTop: 8,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#DCE3ED',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#14213D',
    backgroundColor: '#FFFFFF',
    marginBottom: 18,
  },
  primaryButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  messageBox: {
    backgroundColor: '#FFF4E5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  messageText: {
    color: '#9A5800',
    fontSize: 13,
    lineHeight: 19,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 22,
    gap: 5,
  },
  switchText: {
    color: '#64748B',
    fontSize: 13,
  },
  switchLink: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },
  footer: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
  },
});

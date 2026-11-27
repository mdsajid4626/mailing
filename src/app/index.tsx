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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
          <View style={styles.page}>
            {/* Brand section */}
            <View style={styles.brandSection}>
              <View style={styles.logo}>
                <Text style={styles.logoLetter}>S</Text>
              </View>

              <Text style={styles.brand}>Smart Mail</Text>
              <Text style={styles.tagline}>
                A more organized way to manage your inbox.
              </Text>
            </View>

            {/* Authentication card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.eyebrow}>
                  {mode === 'login' ? 'YOUR PERSONAL WORKSPACE' : 'GET STARTED'}
                </Text>

                <Text style={styles.heading}>
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </Text>

                <Text style={styles.description}>
                  {mode === 'login'
                    ? 'Sign in to access your organized inbox and stay on top of what matters.'
                    : 'Create your Smart Mail account to bring your emails and important updates together.'}
                </Text>
              </View>

              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor="#9AA4B2"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
              </View>

              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#9AA4B2"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />

                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  hitSlop={10}
                >
                  <Text style={styles.passwordToggle}>
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </Text>
                </Pressable>
              </View>

              {mode === 'signup' && (
                <>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter your password"
                    placeholderTextColor="#9AA4B2"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
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
                    {mode === 'login' ? 'Sign in to Smart Mail' : 'Create account'}
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
                    setShowPassword(false);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.switchLink}>
                    {mode === 'login' ? 'Create account' : 'Sign in'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerTitle}>SMART MAIL</Text>
              <Text style={styles.footerText}>
                Your email. Your control. One smarter inbox.
              </Text>
            </View>
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
    backgroundColor: '#F7F8FA',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 38,
  },

  page: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },

  brandSection: {
    alignItems: 'center',
    marginBottom: 30,
  },

  logo: {
    width: 58,
    height: 58,
    borderRadius: 15,
    backgroundColor: '#172B4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 13,
  },

  logoLetter: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '700',
  },

  brand: {
    color: '#172B4D',
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  tagline: {
    color: '#718096',
    fontSize: 13,
    marginTop: 7,
    textAlign: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EAF0',
    borderRadius: 13,
    padding: 27,
  },

  cardHeader: {
    marginBottom: 27,
  },

  eyebrow: {
    color: '#55779B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 12,
  },

  heading: {
    color: '#172B4D',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  description: {
    color: '#718096',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 9,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  label: {
    color: '#34445B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 9,
  },

  input: {
    height: 49,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 7,
    paddingHorizontal: 13,
    fontSize: 14,
    color: '#172B4D',
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },

  passwordContainer: {
    height: 49,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 7,
    paddingHorizontal: 13,
    marginBottom: 20,
  },

  passwordInput: {
    flex: 1,
    height: '100%',
    color: '#172B4D',
    fontSize: 14,
  },

  passwordToggle: {
    color: '#55779B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  primaryButton: {
    height: 50,
    backgroundColor: '#172B4D',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  pressed: {
    opacity: 0.85,
  },

  disabled: {
    opacity: 0.6,
  },

  messageBox: {
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#F3D5B8',
    borderRadius: 7,
    padding: 12,
    marginBottom: 13,
  },

  messageText: {
    color: '#945B27',
    fontSize: 12,
    lineHeight: 19,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 24,
  },

  switchText: {
    color: '#718096',
    fontSize: 12,
  },

  switchLink: {
    color: '#55779B',
    fontSize: 12,
    fontWeight: '800',
  },

  footer: {
    alignItems: 'center',
    marginTop: 27,
  },

  footerTitle: {
    color: '#9AA4B2',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },

  footerText: {
    color: '#9AA4B2',
    fontSize: 11,
    marginTop: 7,
  },
});

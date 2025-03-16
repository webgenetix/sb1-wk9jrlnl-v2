import { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import { Icons } from '../../components/Icons';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function validateEmail() {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }

    return true;
  }

  async function validatePassword() {
    if (!password.trim()) {
      setError('Password is required');
      return false;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    return true;
  }

  async function validateUsername() {
    if (!username.trim()) {
      setError('Username is required');
      return false;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }

    // Check if username already exists
    try {
      const { data, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .single();

      if (data) {
        setError('Username is already taken');
        return false;
      }
    } catch (error) {
      // If error is PGRST116 (not found), that's good - username is available
      if (error.code !== 'PGRST116') {
        console.error('Error checking username:', error);
        setError('Error checking username availability');
        return false;
      }
    }

    return true;
  }

  async function handleNextStep() {
    setError(null);

    if (step === 1) {
      const isEmailValid = await validateEmail();
      if (isEmailValid) {
        setStep(2);
      }
    } else if (step === 2) {
      const isPasswordValid = await validatePassword();
      if (isPasswordValid) {
        setStep(3);
      }
    }
  }

  async function handleRegister() {
    setLoading(true);
    setError(null);

    try {
      // Validate username
      const isUsernameValid = await validateUsername();
      if (!isUsernameValid) {
        setLoading(false);
        return;
      }

      // Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Registration failed');

      // Create profile with username
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          username: username,
          updated_at: new Date().toISOString(),
        });

      if (profileError) throw profileError;

      router.replace('/(app)/(tabs)');
    } catch (e) {
      console.error('Registration error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function renderStep1() {
    return (
      <>
        <Text style={styles.stepTitle}>Step 1 of 3</Text>
        <Text style={styles.stepDescription}>Let's start with your email</Text>
        
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <Button
          title="Continue"
          onPress={handleNextStep}
          loading={loading}
        />
      </>
    );
  }

  function renderStep2() {
    return (
      <>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setStep(1)}
        >
          <Icons.back size={24} color="#1E293B" />
        </TouchableOpacity>
        
        <Text style={styles.stepTitle}>Step 2 of 3</Text>
        <Text style={styles.stepDescription}>Create a secure password</Text>
        
        <View style={styles.passwordContainer}>
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Choose a password"
            secureTextEntry={!passwordVisible}
          />
          <TouchableOpacity 
            style={styles.visibilityToggle}
            onPress={() => setPasswordVisible(!passwordVisible)}
          >
            {passwordVisible ? (
              <Icons.eye size={24} color="#64748B" />
            ) : (
              <Icons.eye size={24} color="#94A3B8" />
            )}
          </TouchableOpacity>
        </View>
        
        <View style={styles.passwordStrength}>
          <Text style={styles.passwordStrengthText}>
            Password strength: {password.length < 6 ? 'Weak' : password.length < 10 ? 'Medium' : 'Strong'}
          </Text>
          <View style={styles.strengthBar}>
            <View 
              style={[
                styles.strengthFill, 
                password.length < 6 
                  ? styles.strengthWeak 
                  : password.length < 10 
                    ? styles.strengthMedium 
                    : styles.strengthStrong,
                { width: `${Math.min(100, (password.length * 10))}%` }
              ]} 
            />
          </View>
        </View>
        
        <Button
          title="Continue"
          onPress={handleNextStep}
          loading={loading}
        />
      </>
    );
  }

  function renderStep3() {
    return (
      <>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setStep(2)}
        >
          <Icons.back size={24} color="#1E293B" />
        </TouchableOpacity>
        
        <Text style={styles.stepTitle}>Step 3 of 3</Text>
        <Text style={styles.stepDescription}>Choose your username</Text>
        
        <Input
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="Enter a unique username"
          autoCapitalize="none"
        />
        
        <Text style={styles.usernameHint}>
          This will be your public identity on the platform
        </Text>
        
        <Button
          title="Create Account"
          onPress={handleRegister}
          loading={loading}
        />
      </>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=800&auto=format&fit=crop&q=80' }}
            style={styles.image}
          />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>
        </View>

        <View style={styles.form}>
          {error && <Text style={styles.error}>{error}</Text>}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Link href="/login" asChild>
            <Button
              title="Sign in instead"
              variant="secondary"
              onPress={() => {}}
            />
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  form: {
    flex: 1,
    padding: 24,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  error: {
    color: '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginLeft: -8,
    marginBottom: 16,
  },
  passwordContainer: {
    position: 'relative',
  },
  visibilityToggle: {
    position: 'absolute',
    right: 16,
    top: 38,
  },
  passwordStrength: {
    marginBottom: 24,
  },
  passwordStrengthText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  strengthBar: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthWeak: {
    backgroundColor: '#EF4444',
  },
  strengthMedium: {
    backgroundColor: '#F59E0B',
  },
  strengthStrong: {
    backgroundColor: '#10B981',
  },
  usernameHint: {
    fontSize: 14,
    color: '#64748B',
    marginTop: -8,
    marginBottom: 24,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    paddingHorizontal: 16,
    color: '#64748B',
    fontSize: 14,
  },
});
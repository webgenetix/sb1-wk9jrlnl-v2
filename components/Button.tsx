import { StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { useTheme } from '../lib/ThemeContext';

interface ButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export const Button = forwardRef<TouchableOpacity, ButtonProps>(
  ({ onPress, title, loading, variant = 'primary' }, ref) => {
    const { colors, isDark } = useTheme();

    const styles = StyleSheet.create({
      buttonContainer: {
        width: '100%',
        height: 50,
        borderRadius: 12,
        overflow: 'hidden',
      },
      gradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      },
      buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
      },
      secondaryButton: {
        backgroundColor: colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
      },
      secondaryButtonText: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: '600',
      },
    });

    if (variant === 'primary') {
      return (
        <TouchableOpacity 
          ref={ref}
          onPress={onPress} 
          disabled={loading}
          style={styles.buttonContainer}
        >
          <LinearGradient
            colors={isDark ? ['#818CF8', '#6366F1'] : ['#6366F1', '#4F46E5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{title}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity 
        ref={ref}
        onPress={onPress} 
        disabled={loading}
        style={[styles.buttonContainer, styles.secondaryButton]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }
);
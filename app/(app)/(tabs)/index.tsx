import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface Video {
  id: string;
  title: string;
  description: string;
  video_url: string;
  user_id: string;
  created_at: string;
}

interface VideoUser {
  username: string;
  avatar_url: string;
}

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const SPACING = 1;
const ITEM_WIDTH = (width - (COLUMN_COUNT + 1) * SPACING) / COLUMN_COUNT;

export default function VideoGrid() {
  const [videos, setVideos] = useState<(Video & { user: VideoUser })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    loadVideos();
  }, []);

  async function ensureProfile(userId: string) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ 
              id: userId,
              username: `user_${userId.slice(0, 8)}`,
              avatar_url: null
            }])
            .select('username, avatar_url')
            .single();

          if (insertError) throw insertError;
          return newProfile;
        }
        throw profileError;
      }

      return profile;
    } catch (error) {
      console.warn('Error ensuring profile:', error);
      return { username: `user_${userId.slice(0, 8)}`, avatar_url: null };
    }
  }

  async function loadVideos() {
    try {
      setError(null);
      
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

      if (videosError) throw videosError;

      const videosWithUsers = await Promise.all(
        videosData.map(async (video) => {
          const userData = await ensureProfile(video.user_id);
          // Generate random stats for demo
          setStats(prev => ({
            ...prev,
            [video.id]: Math.floor(Math.random() * 10000)
          }));
          return {
            ...video,
            user: userData
          };
        })
      );

      setVideos(videosWithUsers);
    } catch (error) {
      console.error('Error loading videos:', error);
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  function navigateToVideo(videoId: string) {
    router.push('/videoscroll');
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={loadVideos} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>For You</Text>
      </View>

      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.videoItem}
            onPress={() => navigateToVideo(item.id)}
          >
            <View style={styles.thumbnail}>
              <Image
                source={{ uri: `https://picsum.photos/seed/${item.id}/300/400` }}
                style={styles.thumbnailImage}
              />
              <View style={styles.overlay}>
                <View style={styles.views}>
                  <Ionicons name="eye-outline" size={16} color="white" />
                  <Text style={styles.viewsText}>
                    {formatNumber(stats[item.id] || 0)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.videoInfo}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {item.title || 'Untitled Video'}
              </Text>
              <Text style={styles.username}>@{item.user.username}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: SPACING,
  },
  videoItem: {
    width: ITEM_WIDTH,
    margin: SPACING,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 3/4,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    padding: 8,
  },
  views: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  videoInfo: {
    padding: 8,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 4,
  },
  username: {
    fontSize: 12,
    color: '#64748B',
  },
});
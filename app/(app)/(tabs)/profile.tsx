import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  FlatList,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Icons } from '../../../components/Icons';
import { Switch } from '../../../components/Switch';
import { useTheme } from '../../../lib/ThemeContext';

interface Profile {
  username: string;
  website: string;
  avatar_url: string;
  follower_count?: number;
  following_count?: number;
}

interface Video {
  id: string;
  title: string;
  description: string;
  video_url: string;
  created_at: string;
  like_count: number;
  bookmark_count?: number;
}

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const SPACING = 1;
const ITEM_WIDTH = (width - (COLUMN_COUNT + 1) * SPACING) / COLUMN_COUNT;

type TabType = 'videos' | 'likes' | 'bookmarks' | 'edit';

export default function Profile() {
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('videos');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    username: '',
    website: '',
    avatar_url: '',
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [likedVideos, setLikedVideos] = useState<Video[]>([]);
  const [bookmarkedVideos, setBookmarkedVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    videos: 0,
    likes: 0,
    followers: 0,
    following: 0,
    bookmarks: 0,
  });

  useEffect(() => {
    loadProfile();
    loadVideos();
    loadLikedVideos();
    loadBookmarkedVideos();
  }, []);

  async function loadProfile() {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      let { data, error: profileError } = await supabase
        .from('profiles')
        .select('username, website, avatar_url, follower_count, following_count')
        .eq('id', user.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([{ id: user.id }])
            .single();

          if (insertError) throw insertError;
          data = {
            username: '',
            website: '',
            avatar_url: '',
            follower_count: 0,
            following_count: 0,
          };
        } else {
          throw profileError;
        }
      }

      if (data) {
        setProfile(data);
        setStats(prev => ({
          ...prev,
          followers: data.follower_count || 0,
          following: data.following_count || 0
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setError('Failed to load profile');
    }
  }

  async function loadVideos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setVideos(data || []);
      setStats(prev => ({ ...prev, videos: data?.length || 0 }));
    } catch (error) {
      console.error('Error loading videos:', error);
    }
  }

  async function loadLikedVideos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('video_likes')
        .select('videos(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const likedVideos = data?.map(item => item.videos).filter(Boolean) || [];
      setLikedVideos(likedVideos);
      setStats(prev => ({ ...prev, likes: likedVideos.length }));
    } catch (error) {
      console.error('Error loading liked videos:', error);
    }
  }

  async function loadBookmarkedVideos() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('video_bookmarks')
        .select('videos(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const bookmarkedVideos = data?.map(item => item.videos).filter(Boolean) || [];
      setBookmarkedVideos(bookmarkedVideos);
      setStats(prev => ({ ...prev, bookmarks: bookmarkedVideos.length }));
    } catch (error) {
      console.error('Error loading bookmarked videos:', error);
    }
  }

  async function uploadAvatar() {
    try {
      setError(null);
      setLoading(true);

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        throw new Error('Permission to access camera roll is required!');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        const ext = file.uri.substring(file.uri.lastIndexOf('.') + 1);
        const fileName = `${uuidv4()}.${ext}`;
        const filePath = `${fileName}`;

        const formData = new FormData();
        if (Platform.OS === 'web') {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          formData.append('file', blob, fileName);
        }

        let { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, Platform.OS === 'web' ? formData.get('file') : {
            uri: file.uri,
            type: `image/${ext}`,
            name: fileName,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
        await updateProfile(publicUrl);
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setError('Failed to upload image');
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(newAvatarUrl?: string) {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const updates = {
        id: user.id,
        username: profile.username,
        website: profile.website,
        avatar_url: newAvatarUrl || profile.avatar_url,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(updates);

      if (updateError) throw updateError;
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      router.replace('/login');
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

  function navigateToFollowers() {
    // In a real app, you would navigate to a followers list screen
    // router.push('/followers');
  }

  function navigateToFollowing() {
    // In a real app, you would navigate to a following list screen
    // router.push('/following');
  }

  function renderHeader() {
    return (
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={uploadAvatar} style={styles.avatarButton}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icons.user size={40} color="#94A3B8" />
              </View>
            )}
            <View style={styles.uploadIcon}>
              <Icons.camera size={14} color="white" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.stats}>
          <TouchableOpacity style={styles.statItem} onPress={() => {}}>
            <Text style={styles.statNumber}>{formatNumber(stats.videos)}</Text>
            <Text style={styles.statLabel}>Videos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={navigateToFollowers}>
            <Text style={styles.statNumber}>{formatNumber(stats.followers)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={navigateToFollowing}>
            <Text style={styles.statNumber}>{formatNumber(stats.following)}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderTabs() {
    return (
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
          onPress={() => setActiveTab('videos')}
        >
          <Icons.video
            size={20}
            color={activeTab === 'videos' ? '#4F46E5' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'videos' && styles.activeTabText,
            ]}
          >
            Videos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'likes' && styles.activeTab]}
          onPress={() => setActiveTab('likes')}
        >
          <Icons.heart
            size={20}
            color={activeTab === 'likes' ? '#4F46E5' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'likes' && styles.activeTabText,
            ]}
          >
            Likes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookmarks' && styles.activeTab]}
          onPress={() => setActiveTab('bookmarks')}
        >
          <Icons.bookmark
            size={20}
            color={activeTab === 'bookmarks' ? '#4F46E5' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'bookmarks' && styles.activeTabText,
            ]}
          >
            Bookmarks
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'edit' && styles.activeTab]}
          onPress={() => setActiveTab('edit')}
        >
          <Icons.settings
            size={20}
            color={activeTab === 'edit' ? '#4F46E5' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'edit' && styles.activeTabText,
            ]}
          >
            Edit
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderVideosTab() {
    let displayVideos;
    let emptyStateMessage;
    
    switch (activeTab) {
      case 'likes':
        displayVideos = likedVideos;
        emptyStateMessage = 'No liked videos';
        break;
      case 'bookmarks':
        displayVideos = bookmarkedVideos;
        emptyStateMessage = 'No bookmarked videos';
        break;
      default:
        displayVideos = videos;
        emptyStateMessage = 'No videos yet';
    }
    
    if (displayVideos.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icons.video size={48} color="#94A3B8" />
          <Text style={styles.emptyStateText}>
            {emptyStateMessage}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={displayVideos}
        numColumns={COLUMN_COUNT}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.videoItem}
            onPress={() => navigateToVideo(item.id)}
          >
            <Image
              source={{ uri: `https://picsum.photos/seed/${item.id}/300/400` }}
              style={styles.videoThumbnail}
            />
            <View style={styles.videoOverlay}>
              <View style={styles.videoStats}>
                <View style={styles.videoStat}>
                  <Icons.heart size={16} color="white" />
                  <Text style={styles.videoStatText}>
                    {formatNumber(item.like_count)}
                  </Text>
                </View>
                {item.bookmark_count > 0 && (
                  <View style={styles.videoStat}>
                    <Icons.bookmark size={16} color="white" />
                    <Text style={styles.videoStatText}>
                      {formatNumber(item.bookmark_count)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.videoGrid}
      />
    );
  }

  function renderEditTab() {
    return (
      <View style={[styles.form, isDark && styles.darkForm]}>
        <Input
          label="Username"
          value={profile.username}
          onChangeText={username => setProfile(prev => ({ ...prev, username }))}
          placeholder="Enter your username"
        />
        <Input
          label="Website"
          value={profile.website}
          onChangeText={website => setProfile(prev => ({ ...prev, website }))}
          placeholder="Enter your website"
        />
        
        <View style={styles.themeContainer}>
          <Text style={[styles.themeText, isDark && styles.darkThemeText]}>Dark Mode</Text>
          <Switch value={isDark} onValueChange={toggleTheme} />
        </View>
        
        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          title="Update Profile"
          onPress={() => updateProfile()}
          loading={loading}
        />

        <View style={styles.spacing} />

        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <ScrollView>
        {renderHeader()}
        {renderTabs()}
        {activeTab === 'edit' ? renderEditTab() : renderVideosTab()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarButton: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4F46E5',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#4F46E5',
  },
  tabText: {
    fontSize: 14,
    color: '#64748B',
  },
  activeTabText: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  form: {
    padding: 24,
  },
  error: {
    color: '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  spacing: {
    height: 16,
  },
  videoGrid: {
    padding: SPACING,
  },
  videoItem: {
    width: ITEM_WIDTH,
    aspectRatio: 3/4,
    margin: SPACING,
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'flex-end',
  },
  videoStats: {
    flexDirection: 'row',
    gap: 12,
  },
  videoStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoStatText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  darkContainer: {
    backgroundColor: '#1E293B',
  },
  darkForm: {
    backgroundColor: '#0F172A',
  },
  themeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 16,
  },
  themeText: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '500',
  },
  darkThemeText: {
    color: '#F8FAFC',
  },
});
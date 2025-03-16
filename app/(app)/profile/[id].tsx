import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { Video } from 'expo-av';
import { supabase } from '../../../lib/supabase';
import { Icons } from '../../../components/Icons';
import { useTheme } from '../../../lib/ThemeContext';

interface Profile {
  id: string;
  username: string;
  website: string;
  avatar_url: string;
  follower_count?: number;
  following_count?: number;
}

interface VideoItem {
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

type TabType = 'videos' | 'likes' | 'bookmarks';

export default function UserProfile() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [likedVideos, setLikedVideos] = useState<VideoItem[]>([]);
  const [bookmarkedVideos, setBookmarkedVideos] = useState<VideoItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('videos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    videos: 0,
    followers: 0,
    following: 0,
    bookmarks: 0,
    likes: 0,
  });
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const videoRefs = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    loadProfile();
    getCurrentUser();
  }, [id]);

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      if (id) {
        checkIfFollowing(user.id, id as string);
      }
    }
  }

  async function checkIfFollowing(followerId: string, followingId: string) {
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .single();
      
      setIsFollowing(!!data);
    } catch (error) {
      console.error('Error checking follow status:', error);
      setIsFollowing(false);
    }
  }

  async function loadProfile() {
    try {
      setError(null);
      setLoading(true);

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (profileError) throw profileError;
      setProfile(profile);

      // Set follower and following counts
      setStats(prev => ({
        ...prev,
        followers: profile.follower_count || 0,
        following: profile.following_count || 0
      }));

      // Fetch user's videos
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      if (videosError) throw videosError;
      setVideos(videos);
      setStats(prev => ({ ...prev, videos: videos.length }));

      // Fetch liked videos
      const { data: likedVideos, error: likedError } = await supabase
        .from('video_likes')
        .select('videos(*)')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      if (likedError) throw likedError;
      const likedVideosList = likedVideos.map(like => like.videos).filter(Boolean);
      setLikedVideos(likedVideosList);
      setStats(prev => ({ ...prev, likes: likedVideosList.length }));

      // Fetch bookmarked videos
      const { data: bookmarkedVideos, error: bookmarkedError } = await supabase
        .from('video_bookmarks')
        .select('videos(*)')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      if (bookmarkedError) throw bookmarkedError;
      setBookmarkedVideos(bookmarkedVideos.map(bookmark => bookmark.videos).filter(Boolean));
      setStats(prev => ({ ...prev, bookmarks: bookmarkedVideos.length }));

    } catch (error) {
      console.error('Error loading profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function VideoPlayer({ video, isCurrentVideo }: { video: VideoItem, isCurrentVideo: boolean }) {
    if (Platform.OS === 'web') {
      return (
        <video
          ref={el => {
            if (el) videoRefs.current[video.id] = el;
          }}
          src={video.video_url}
          style={styles.video}
          loop
          playsInline
          controls
          muted
          autoPlay={isCurrentVideo}
        />
      );
    }

    return (
      <Video
        ref={ref => {
          if (ref) videoRefs.current[video.id] = ref;
        }}
        source={{ uri: video.video_url }}
        style={styles.video}
        resizeMode="cover"
        shouldPlay={isCurrentVideo}
        isLooping
        isMuted
        useNativeControls
      />
    );
  }

  function navigateToVideo(videoId: string) {
    router.push('/videoscroll');
  }

  async function handleFollow() {
    if (!currentUserId || !id) return;
    
    try {
      setFollowLoading(true);
      
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', id);
          
        if (error) throw error;
        
        setIsFollowing(false);
        setStats(prev => ({
          ...prev,
          followers: Math.max(0, prev.followers - 1)
        }));
        
        Alert.alert(
          "Unfollowed",
          `You unfollowed @${profile?.username}`
        );
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: id
          });
          
        if (error) throw error;
        
        setIsFollowing(true);
        setStats(prev => ({
          ...prev,
          followers: prev.followers + 1
        }));
        
        Alert.alert(
          "Followed",
          `You followed @${profile?.username}!`
        );
      }
    } catch (error) {
      console.error('Error following/unfollowing:', error);
      Alert.alert(
        "Error",
        "Failed to update follow status. Please try again."
      );
    } finally {
      setFollowLoading(false);
    }
  }

  function handleMessage() {
    if (!profile) return;
    
    // Navigate to messages tab and open conversation with this user
    router.push({
      pathname: "/(app)/(tabs)/messages",
      params: { userId: id, username: profile.username }
    });
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>
          {error || 'Profile not found'}
        </Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let displayVideos;
  let emptyStateMessage;
  
  switch (activeTab) {
    case 'likes':
      displayVideos = likedVideos;
      emptyStateMessage = 'No liked videos';
      break;
    case 'bookmarks':
      displayVideos = bookmarkedVideos;
      emptyStateMessage = 'No saved videos';
      break;
    default:
      displayVideos = videos;
      emptyStateMessage = 'No videos yet';
  }
  
  const isOwnProfile = currentUserId === id;

  return (
    <>
      <Stack.Screen 
        options={{
          headerTitle: `@${profile.username}`,
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <Icons.back size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }} 
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          {profile.avatar_url ? (
            <Image 
              source={{ uri: profile.avatar_url }} 
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
              <Icons.user size={40} color={colors.primary} />
            </View>
          )}

          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {formatNumber(stats.videos)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Videos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {formatNumber(stats.followers)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {formatNumber(stats.following)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.subtext }]}>Following</Text>
            </View>
          </View>
        </View>

        <View style={[styles.bio, { backgroundColor: colors.card }]}>
          <Text style={[styles.username, { color: colors.text }]}>@{profile.username}</Text>
          {profile.website && (
            <TouchableOpacity>
              <Text style={[styles.website, { color: colors.primary }]}>{profile.website}</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isOwnProfile && (
          <View style={[styles.actions, { backgroundColor: colors.card }]}>
            <TouchableOpacity 
              style={[
                styles.followButton, 
                { backgroundColor: isFollowing ? colors.primaryLight : colors.primary },
                followLoading && { opacity: 0.7 }
              ]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.primary : "white"} />
              ) : (
                <Text 
                  style={[
                    styles.followButtonText, 
                    { color: isFollowing ? colors.primary : 'white' }
                  ]}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.messageButton, { backgroundColor: colors.primaryLight }]}
              onPress={handleMessage}
            >
              <Icons.messages size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.tabs, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
            onPress={() => setActiveTab('videos')}
          >
            <Icons.video
              size={20}
              color={activeTab === 'videos' ? colors.primary : colors.subtext}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'videos' ? colors.primary : colors.subtext },
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
              color={activeTab === 'likes' ? colors.primary : colors.subtext}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'likes' ? colors.primary : colors.subtext },
              ]}
            >
              Liked
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'bookmarks' && styles.activeTab]}
            onPress={() => setActiveTab('bookmarks')}
          >
            <Icons.bookmark
              size={20}
              color={activeTab === 'bookmarks' ? colors.primary : colors.subtext}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'bookmarks' ? colors.primary : colors.subtext },
              ]}
            >
              Saved
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={displayVideos}
          numColumns={COLUMN_COUNT}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.videoGrid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.videoItem}
              onPress={() => navigateToVideo(item.id)}
            >
              <Image
                source={{ uri: `https://picsum.photos/seed/${item.id}/300/400` }}
                style={styles.videoThumbnail}
              />
              <View style={[styles.videoOverlay, { backgroundColor: colors.overlay }]}>
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
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icons.video size={48} color={colors.subtext} />
              <Text style={[styles.emptyStateText, { color: colors.subtext }]}>
                {emptyStateMessage}
              </Text>
            </View>
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButton: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 20,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  stats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  bio: {
    padding: 20,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  website: {
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  followButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  messageButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
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
  },
  video: {
    width: '100%',
    height: '100%',
  },
});